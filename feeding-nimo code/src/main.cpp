#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include "Ph4502C.h"
#include "Feeder.h"
#include "hx711.h"

// Pin config
#define PH_SENSOR_PIN   A0
#define I2C_SDA         21
#define I2C_SCL         22
#define OLED_ADDR       0x3C
#define FEEDER_SERVO_PIN 27
#define BUTTON_UP_PIN   12
#define BUTTON_SET_PIN  13
#define BUTTON_DOWN_PIN 14
#define HX711_DOUT_PIN  18
#define HX711_SCK_PIN   19
#define LED_LOW_PIN     25
#define LED_MEDIUM_PIN  26
#define LED_HIGH_PIN    33

static const char* SETUP_AP_SSID     = "Feeding Nimo Setup";
static const char* SETUP_AP_PASSWORD = "feedingnimo";
static const uint16_t CONTROL_PORT   = 8020;
static const uint8_t MAX_SCHEDULES   = 12;

struct FeedingSchedule {
    uint8_t hour;
    uint8_t minute;
};

class App {
public:
    App()
        : phSensor(PH_SENSOR_PIN, I2C_SDA, I2C_SCL, OLED_ADDR),
          feeder(FEEDER_SERVO_PIN, BUTTON_UP_PIN, BUTTON_SET_PIN, BUTTON_DOWN_PIN),
          loadCell(HX711_DOUT_PIN, HX711_SCK_PIN, LED_LOW_PIN, LED_MEDIUM_PIN, LED_HIGH_PIN),
          setupServer(80),
          controlServer(CONTROL_PORT),
          setupPortalActive(false),
          controlServerActive(false),
          reconnectAtMs(0),
          scheduleCount(0),
          lastScheduleCheckMinute(-1) {}

    void setup() {
        Serial.begin(115200);
        delay(1000);

        phSensor.beginSerial(Serial2, 16, 17, 115200);
        if (!phSensor.begin()) {
            Serial.println("OLED init failed");
            while (true) delay(500);
        }

        loadConfig();
        connectOrStartSetupPortal();
        feeder.begin();
        loadCell.begin();

        Serial.println("Feeding Nimo started");
    }

    void loop() {
        phSensor.update();
        feeder.update();
        loadCell.update();
        handleSetupPortal();
        handleControlServer();
        checkSchedules();

        unsigned long now = millis();
        if (reconnectAtMs && now >= reconnectAtMs) {
            reconnectAtMs = 0;
            connectOrStartSetupPortal();
        }

        delay(50);
    }

private:
    PH4502C  phSensor;
    Feeder   feeder;
    LoadCell loadCell;
    Preferences prefs;
    WebServer setupServer;
    WebServer controlServer;
    String wifiSsid;
    String wifiPassword;
    bool setupPortalActive;
    bool controlServerActive;
    unsigned long reconnectAtMs;
    FeedingSchedule schedules[MAX_SCHEDULES];
    uint8_t scheduleCount;
    int lastScheduleCheckMinute;

    void loadConfig() {
        prefs.begin("aquawatch", false);
        wifiSsid = prefs.getString("wifi_ssid", "");
        wifiPassword = prefs.getString("wifi_pass", "");

        scheduleCount = prefs.getUChar("schedule_count", 0);
        if (scheduleCount > MAX_SCHEDULES) scheduleCount = 0;
        for (uint8_t i = 0; i < scheduleCount; i++) {
            char key[12];
            snprintf(key, sizeof(key), "sched_%u", i);
            uint16_t encoded = prefs.getUShort(key, 0);
            schedules[i].hour = encoded / 60;
            schedules[i].minute = encoded % 60;
        }
        applyFirstScheduleToDisplay();
    }

    void saveWifiConfig(const String& ssid, const String& password) {
        wifiSsid = ssid;
        wifiPassword = password;
        prefs.putString("wifi_ssid", wifiSsid);
        prefs.putString("wifi_pass", wifiPassword);
    }

    void saveSchedules() {
        prefs.putUChar("schedule_count", scheduleCount);
        for (uint8_t i = 0; i < scheduleCount; i++) {
            char key[12];
            snprintf(key, sizeof(key), "sched_%u", i);
            prefs.putUShort(key, (schedules[i].hour * 60) + schedules[i].minute);
        }
        applyFirstScheduleToDisplay();
    }

    void applyFirstScheduleToDisplay() {
        if (scheduleCount > 0) {
            feeder.setFeedingTime(schedules[0].hour, schedules[0].minute);
        }
    }

    void connectOrStartSetupPortal() {
        if (!wifiSsid.length()) {
            startSetupPortal();
            return;
        }

        Serial.printf("Connecting to WiFi SSID: %s\n", wifiSsid.c_str());
        WiFi.mode(WIFI_STA);
        WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());

        unsigned long startMs = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - startMs < 15000) {
            delay(500);
            Serial.print(".");
        }
        Serial.println();

        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf("WiFi connected: %s, control port %u\n", WiFi.localIP().toString().c_str(), CONTROL_PORT);
            setupPortalActive = false;
            setupServer.stop();
            startControlServer();
            return;
        }

        Serial.println("WiFi failed; starting setup portal");
        startSetupPortal();
    }

    void startSetupPortal() {
        if (setupPortalActive) return;

        WiFi.mode(WIFI_AP_STA);
        WiFi.softAP(SETUP_AP_SSID, SETUP_AP_PASSWORD);
        Serial.printf("Setup AP started: %s at %s\n", SETUP_AP_SSID, WiFi.softAPIP().toString().c_str());

        setupServer.on("/networks", HTTP_GET, [this]() { handleNetworks(); });
        setupServer.on("/configure", HTTP_POST, [this]() { handleConfigure(); });
        setupServer.onNotFound([this]() { sendCors(setupServer, 404, "application/json", "{\"error\":\"not found\"}"); });
        setupServer.begin();
        setupPortalActive = true;
    }

    void startControlServer() {
        if (controlServerActive) return;

        controlServer.on("/status", HTTP_GET, [this]() { handleStatus(); });
        controlServer.on("/schedule", HTTP_GET, [this]() { handleSchedule(); });
        controlServer.on("/settime", HTTP_GET, [this]() { handleSetTime(); });
        controlServer.on("/feed", HTTP_GET, [this]() {
            feeder.spinServoPublic();
            sendCors(controlServer, 200, "application/json", "{\"success\":true}");
        });
        controlServer.onNotFound([this]() { sendCors(controlServer, 404, "application/json", "{\"error\":\"not found\"}"); });
        controlServer.begin();
        controlServerActive = true;
    }

    void handleSetupPortal() {
        if (setupPortalActive) {
            setupServer.handleClient();
        }
    }

    void handleControlServer() {
        if (controlServerActive) {
            controlServer.handleClient();
        }
    }

    void handleNetworks() {
        int count = WiFi.scanNetworks();
        JsonDocument doc;
        JsonArray networks = doc.to<JsonArray>();

        for (int i = 0; i < count; i++) {
            JsonObject network = networks.add<JsonObject>();
            network["ssid"] = WiFi.SSID(i);
            network["rssi"] = WiFi.RSSI(i);
            network["secure"] = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
        }

        String body;
        serializeJson(networks, body);
        sendCors(setupServer, 200, "application/json", body);
        WiFi.scanDelete();
    }

    void handleConfigure() {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, setupServer.arg("plain"));
        if (err || !doc["ssid"].is<const char*>()) {
            sendCors(setupServer, 400, "application/json", "{\"error\":\"ssid required\"}");
            return;
        }

        String ssid = doc["ssid"].as<String>();
        String password = doc["password"] | "";
        saveWifiConfig(ssid, password);

        sendCors(setupServer, 200, "application/json", "{\"success\":true,\"message\":\"saved\"}");
        reconnectAtMs = millis() + 1000;
    }

    void handleStatus() {
        JsonDocument doc;
        char timeBuffer[9];
        snprintf(timeBuffer, sizeof(timeBuffer), "%02d:%02d:%02d",
            feeder.getCurrentHour(), feeder.getCurrentMinute(), feeder.getCurrentSecond());

        float ph = phSensor.getPH();
        float weight = loadCell.getWeight();
        FoodLevel foodLevel = loadCell.getFoodLevel();

        doc["time"] = timeBuffer;
        doc["weight"] = weight;
        doc["level"] = foodLevel == FOOD_LOW ? "LOW" : foodLevel == FOOD_MEDIUM ? "MEDIUM" : "HIGH";
        doc["ph"] = ph;
        doc["safety"] = (ph >= 6.5f && ph <= 8.5f) ? "SAFE" : "UNSAFE";
        JsonArray arr = doc["schedule"].to<JsonArray>();
        for (uint8_t i = 0; i < scheduleCount; i++) {
            JsonObject item = arr.add<JsonObject>();
            item["hour"] = schedules[i].hour;
            item["minute"] = schedules[i].minute;
        }

        String body;
        serializeJson(doc, body);
        sendCors(controlServer, 200, "application/json", body);
    }

    void handleSchedule() {
        if (controlServer.hasArg("clear") && controlServer.arg("clear") == "1") {
            scheduleCount = 0;
            saveSchedules();
            sendCors(controlServer, 200, "application/json", "{\"success\":true}");
            return;
        }

        if (!controlServer.hasArg("hour") || !controlServer.hasArg("minute")) {
            sendCors(controlServer, 400, "application/json", "{\"error\":\"hour and minute required\"}");
            return;
        }

        int hour = controlServer.arg("hour").toInt();
        int minute = controlServer.arg("minute").toInt();
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            sendCors(controlServer, 400, "application/json", "{\"error\":\"invalid time\"}");
            return;
        }
        if (scheduleCount >= MAX_SCHEDULES) {
            sendCors(controlServer, 400, "application/json", "{\"error\":\"schedule full\"}");
            return;
        }

        schedules[scheduleCount++] = { static_cast<uint8_t>(hour), static_cast<uint8_t>(minute) };
        saveSchedules();
        sendCors(controlServer, 200, "application/json", "{\"success\":true}");
    }

    void handleSetTime() {
        if (!controlServer.hasArg("hour") || !controlServer.hasArg("minute") || !controlServer.hasArg("second")) {
            sendCors(controlServer, 400, "application/json", "{\"error\":\"hour, minute, and second required\"}");
            return;
        }

        int hour = controlServer.arg("hour").toInt();
        int minute = controlServer.arg("minute").toInt();
        int second = controlServer.arg("second").toInt();
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
            sendCors(controlServer, 400, "application/json", "{\"error\":\"invalid time\"}");
            return;
        }

        feeder.setCurrentTime(hour, minute, second);
        lastScheduleCheckMinute = -1;
        sendCors(controlServer, 200, "application/json", "{\"success\":true}");
    }

    void checkSchedules() {
        int hour = feeder.getCurrentHour();
        int minute = feeder.getCurrentMinute();
        int minuteOfDay = hour * 60 + minute;
        if (minuteOfDay == lastScheduleCheckMinute) return;

        lastScheduleCheckMinute = minuteOfDay;
        for (uint8_t i = 0; i < scheduleCount; i++) {
            if (schedules[i].hour == hour && schedules[i].minute == minute) {
                feeder.spinServoPublic();
                break;
            }
        }
    }

    void sendCors(WebServer& server, int code, const char* type, const String& body) {
        server.sendHeader("Access-Control-Allow-Origin", "*");
        server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
        server.send(code, type, body);
    }
};

App app;

void setup() { app.setup(); }
void loop()  { app.loop(); }
