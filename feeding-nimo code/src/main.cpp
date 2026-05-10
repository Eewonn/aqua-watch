#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "Ph4502C.h"
#include "Feeder.h"
#include "TDSSensor.h"
#include "hx711.h"

// ── Pin config ────────────────────────────────────────────────────────────────
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

// ── Network / API ─────────────────────────────────────────────────────────────
static const char* WIFI_SSID     = "LORZANO WIFI";
static const char* WIFI_PASSWORD = "lorzanowifi2024";
static const char* API_BASE      = "https://aqua-watch-backend.vercel.app";
static const char* DEVICE_ID     = "esp32-001";

// ── Timing ────────────────────────────────────────────────────────────────────
static const unsigned long READING_INTERVAL_MS = 5UL * 60UL * 1000UL; // 5 min
static const unsigned long COMMAND_INTERVAL_MS = 10UL * 1000UL;        // 10 sec
static const uint8_t API_RETRY_COUNT = 3;
static const unsigned long API_RETRY_DELAY_MS = 750;

class App {
public:
    App()
        : phSensor(PH_SENSOR_PIN, TDS_SENSOR_PIN, I2C_SDA, I2C_SCL, OLED_ADDR, PPM_OLED_ADDR),
          feeder(FEEDER_SERVO_PIN, BUTTON_UP_PIN, BUTTON_SET_PIN, BUTTON_DOWN_PIN, WIFI_SSID, WIFI_PASSWORD),
          loadCell(HX711_DOUT_PIN, HX711_SCK_PIN, LED_LOW_PIN, LED_MEDIUM_PIN, LED_HIGH_PIN),
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

        feeder.begin(); // also connects WiFi
        loadCell.begin();

        // Post an initial reading right away once WiFi is up
        if (WiFi.status() == WL_CONNECTED) {
            postReadings();
        }

        Serial.println("AquaWatch started");
    }

    void loop() {
        phSensor.update();
        feeder.update();
        loadCell.update();

        unsigned long now = millis();

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

    unsigned long lastReadingMs;
    unsigned long lastCommandMs;

    void postReadings() {
        float ph        = phSensor.getPH();
        float tds       = phSensor.getTDS();
        float foodLevel = loadCell.getWeightPercent();

        char body[128];
        snprintf(body, sizeof(body),
            "{\"device_id\":\"%s\",\"ph\":%.2f,\"tds\":%.1f,\"food_level\":%.1f}",
            DEVICE_ID, ph, tds, foodLevel);

        WiFiClientSecure client;
        client.setInsecure();
        HTTPClient http;

        char url[128];
        snprintf(url, sizeof(url), "%s/api/readings", API_BASE);
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
            Serial.printf("POST /api/readings → %d\n", code);
        } else {
            Serial.printf("POST /api/readings failed: %s\n", http.errorToString(code).c_str());
        }
        http.end();
    }

    void pollAndExecuteCommands() {
        WiFiClientSecure client;
        client.setInsecure();
        HTTPClient http;

        char url[160];
        snprintf(url, sizeof(url), "%s/api/commands/pending?device_id=%s", API_BASE, DEVICE_ID);
        http.begin(client, url);

        int code = 0;
        for (uint8_t attempt = 1; attempt <= API_RETRY_COUNT; attempt++) {
            code = http.GET();
            if (code == 200) break;

            Serial.printf("GET /api/commands/pending attempt %u → %d\n", attempt, code);
            if (attempt < API_RETRY_COUNT) delay(API_RETRY_DELAY_MS);
        }

        if (code != 200) {
            Serial.printf("GET /api/commands/pending → %d\n", code);
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
            feeder.spinServoPublic(); // dispense food

            // Mark executed
            WiFiClientSecure c2;
            c2.setInsecure();
            HTTPClient h2;
            char patchUrl[160];
            snprintf(patchUrl, sizeof(patchUrl), "%s/api/commands/%s/execute", API_BASE, id);
            h2.begin(c2, patchUrl);
            h2.addHeader("Content-Type", "application/json");
            int pcode = h2.sendRequest("PATCH", "{}");
            Serial.printf("PATCH execute → %d\n", pcode);
            h2.end();
        }
    }
};

App app;

void setup() { app.setup(); }
void loop()  { app.loop(); }
