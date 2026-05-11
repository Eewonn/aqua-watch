#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include "Ph4502C.h"
#include "Feeder.h"
#include "TDSSensor.h"
#include "hx711.h"

// Pin config
#define PH_SENSOR_PIN   A0
#define I2C_SDA         21
#define I2C_SCL         22
#define OLED_ADDR       0x3C
#define PPM_OLED_ADDR   0x3D
#define FEEDER_SERVO_PIN 27
#define BUTTON_UP_PIN   12
#define BUTTON_SET_PIN  13
#define BUTTON_DOWN_PIN 14
#define TDS_SENSOR_PIN  34
#define HX711_DOUT_PIN  18
#define HX711_SCK_PIN   19
#define LED_LOW_PIN     25
#define LED_MEDIUM_PIN  26
#define LED_HIGH_PIN    33

// Defaults used before the ESP32 is configured from the app.
static const char* DEFAULT_API_BASE  = "https://aqua-watch-backend.vercel.app";
static const char* DEFAULT_DEVICE_ID = "esp32-001";
static const char* SETUP_AP_SSID     = "Feeding Nimo Setup";
static const char* SETUP_AP_PASSWORD = "feedingnimo";

static const unsigned long READING_INTERVAL_MS = 5UL * 60UL * 1000UL;
static const unsigned long COMMAND_INTERVAL_MS = 10UL * 1000UL;
static const uint8_t API_RETRY_COUNT = 3;
static const unsigned long API_RETRY_DELAY_MS = 750;

class App {
public:
    App()
        : phSensor(PH_SENSOR_PIN, TDS_SENSOR_PIN, I2C_SDA, I2C_SCL, OLED_ADDR, PPM_OLED_ADDR),
          feeder(FEEDER_SERVO_PIN, BUTTON_UP_PIN, BUTTON_SET_PIN, BUTTON_DOWN_PIN),
          loadCell(HX711_DOUT_PIN, HX711_SCK_PIN, LED_LOW_PIN, LED_MEDIUM_PIN, LED_HIGH_PIN),
          setupServer(80),
          setupPortalActive(false),
          reconnectAtMs(0),
          lastReadingMs(0),
          lastCommandMs(0) {}

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

        if (WiFi.status() == WL_CONNECTED) {
            postReadings();
        }

        Serial.println("Feeding Nimo started");
    }

    void loop() {
        phSensor.update();
        feeder.update();
        loadCell.update();
        handleSetupPortal();

        unsigned long now = millis();
        if (reconnectAtMs && now >= reconnectAtMs) {
            reconnectAtMs = 0;
            connectOrStartSetupPortal();
        }

        if (WiFi.status() == WL_CONNECTED) {
            if (now - lastReadingMs >= READING_INTERVAL_MS) {
                lastReadingMs = now;
                postReadings();
            }
            if (now - lastCommandMs >= COMMAND_INTERVAL_MS) {
                lastCommandMs = now;
                pollAndExecuteCommands();
            }
        }

        delay(50);
    }

private:
    PH4502C  phSensor;
    Feeder   feeder;
    LoadCell loadCell;
    Preferences prefs;
    WebServer setupServer;
    String wifiSsid;
    String wifiPassword;
    String apiBase;
    String deviceId;
    bool setupPortalActive;
    unsigned long reconnectAtMs;
    unsigned long lastReadingMs;
    unsigned long lastCommandMs;

    void loadConfig() {
        prefs.begin("aquawatch", false);
        wifiSsid = prefs.getString("wifi_ssid", "");
        wifiPassword = prefs.getString("wifi_pass", "");
        apiBase = prefs.getString("api_base", DEFAULT_API_BASE);
        deviceId = prefs.getString("device_id", DEFAULT_DEVICE_ID);
    }

    void saveConfig(const String& ssid, const String& password, const String& base, const String& id) {
        wifiSsid = ssid;
        wifiPassword = password;
        apiBase = base.length() ? base : DEFAULT_API_BASE;
        deviceId = id.length() ? id : DEFAULT_DEVICE_ID;

        prefs.putString("wifi_ssid", wifiSsid);
        prefs.putString("wifi_pass", wifiPassword);
        prefs.putString("api_base", apiBase);
        prefs.putString("device_id", deviceId);
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
            Serial.printf("WiFi connected: %s\n", WiFi.localIP().toString().c_str());
            setupPortalActive = false;
            setupServer.stop();
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
        setupServer.onNotFound([this]() {
            if (setupServer.method() == HTTP_OPTIONS) {
                sendCors(204, "text/plain", "");
                return;
            }
            sendCors(404, "application/json", "{\"error\":\"not found\"}");
        });
        setupServer.begin();
        setupPortalActive = true;
    }

    void handleSetupPortal() {
        if (setupPortalActive) {
            setupServer.handleClient();
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
        sendCors(200, "application/json", body);
        WiFi.scanDelete();
    }

    void handleConfigure() {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, setupServer.arg("plain"));
        if (err || !doc["ssid"].is<const char*>()) {
            sendCors(400, "application/json", "{\"error\":\"ssid required\"}");
            return;
        }

        String ssid = doc["ssid"].as<String>();
        String password = doc["password"] | "";
        String base = doc["api_base"] | apiBase;
        String id = doc["device_id"] | deviceId;
        saveConfig(ssid, password, base, id);

        sendCors(200, "application/json", "{\"success\":true,\"message\":\"saved\"}");
        reconnectAtMs = millis() + 1000;
    }

    void sendCors(int code, const char* type, const String& body) {
        setupServer.sendHeader("Access-Control-Allow-Origin", "*");
        setupServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        setupServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
        setupServer.send(code, type, body);
    }

    void postReadings() {
        float ph        = phSensor.getPH();
        float tds       = phSensor.getTDS();
        float foodLevel = loadCell.getWeightPercent();

        char body[128];
        snprintf(body, sizeof(body),
            "{\"device_id\":\"%s\",\"ph\":%.2f,\"tds\":%.1f,\"food_level\":%.1f}",
            deviceId.c_str(), ph, tds, foodLevel);

        WiFiClientSecure client;
        client.setInsecure();
        HTTPClient http;

        char url[192];
        snprintf(url, sizeof(url), "%s/api/readings", apiBase.c_str());
        http.begin(client, url);
        http.addHeader("Content-Type", "application/json");

        int code = 0;
        for (uint8_t attempt = 1; attempt <= API_RETRY_COUNT; attempt++) {
            code = http.POST(body);
            if (code >= 200 && code < 300) break;

            Serial.printf("POST /api/readings attempt %u failed", attempt);
            if (code > 0) {
                Serial.printf(" with HTTP %d\n", code);
            } else {
                Serial.printf(": %s\n", http.errorToString(code).c_str());
            }
            if (attempt < API_RETRY_COUNT) delay(API_RETRY_DELAY_MS);
        }

        if (code > 0) {
            Serial.printf("POST /api/readings -> %d\n", code);
        } else {
            Serial.printf("POST /api/readings failed: %s\n", http.errorToString(code).c_str());
        }
        http.end();
    }

    void pollAndExecuteCommands() {
        WiFiClientSecure client;
        client.setInsecure();
        HTTPClient http;

        char url[224];
        snprintf(url, sizeof(url), "%s/api/commands/pending?device_id=%s", apiBase.c_str(), deviceId.c_str());
        http.begin(client, url);

        int code = 0;
        for (uint8_t attempt = 1; attempt <= API_RETRY_COUNT; attempt++) {
            code = http.GET();
            if (code == 200) break;

            Serial.printf("GET /api/commands/pending attempt %u -> %d\n", attempt, code);
            if (attempt < API_RETRY_COUNT) delay(API_RETRY_DELAY_MS);
        }

        if (code != 200) {
            Serial.printf("GET /api/commands/pending -> %d\n", code);
            http.end();
            return;
        }

        String payload = http.getString();
        http.end();

        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, payload);
        if (err || !doc.is<JsonArray>()) return;

        JsonArray arr = doc.as<JsonArray>();
        for (JsonObject cmd : arr) {
            const char* id = cmd["id"];
            if (!id) continue;

            Serial.printf("Executing command %s\n", id);
            feeder.spinServoPublic();

            WiFiClientSecure c2;
            c2.setInsecure();
            HTTPClient h2;
            char patchUrl[224];
            snprintf(patchUrl, sizeof(patchUrl), "%s/api/commands/%s/execute", apiBase.c_str(), id);
            h2.begin(c2, patchUrl);
            h2.addHeader("Content-Type", "application/json");
            int pcode = h2.sendRequest("PATCH", "{}");
            Serial.printf("PATCH execute -> %d\n", pcode);
            h2.end();
        }
    }
};

App app;

void setup() { app.setup(); }
void loop()  { app.loop(); }
