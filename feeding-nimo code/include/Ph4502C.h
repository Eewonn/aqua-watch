#ifndef PH4502C_H
#define PH4502C_H

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "TDSSensor.h"

class PH4502C {
public:
    PH4502C(int analogPin, int tdsPin, int i2cSda = 21, int i2cScl = 22, uint8_t oledAddress = 0x3C, uint8_t ppmOledAddress = 0x3D);

    bool begin();
    void beginSerial(HardwareSerial& serialPort, int rxPin, int txPin, uint32_t baud = 115200);
    void update();

    float getPH() const;
    float getTDS() const;
    float getVoltageMillivolts() const;
    int getRawADC() const;
    void setCalibrationOffset(float offsetMillivolts);

private:
    int analogPin_;
    int i2cSda_;
    int i2cScl_;
    uint8_t oledAddress_;
    uint8_t ppmOledAddress_;
    float calibrationOffsetMv_;
    int rawAdc_;
    float voltageMv_;
    float phValue_;
    float tdsValue_;
    unsigned long lastSampleMs_;
    Adafruit_SSD1306 display_;
    Adafruit_SSD1306 ppmDisplay_;
    TDSSensor tdsSensor_;
    HardwareSerial* serialPort_;
    int serialRxPin_;
    int serialTxPin_;
    uint32_t serialBaud_;
    bool useSerial_;
    String serialLine_;

    bool parseSerialData();
    void drawDisplay();
    void drawPpmDisplay();
    void sampleSensor();
    float rawToMillivolts(int raw) const;
    float millivoltsToPH(float millivolts) const;
};

#endif // PH4502C_H
