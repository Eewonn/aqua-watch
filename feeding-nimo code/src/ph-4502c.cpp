#include "Ph4502C.h"

PH4502C::PH4502C(int analogPin, int tdsPin, int i2cSda, int i2cScl, uint8_t oledAddress, uint8_t ppmOledAddress)
    : analogPin_(analogPin),
      i2cSda_(i2cSda),
      i2cScl_(i2cScl),
      oledAddress_(oledAddress),
      ppmOledAddress_(ppmOledAddress),
      calibrationOffsetMv_(0.0f),
      rawAdc_(0),
      voltageMv_(0.0f),
      phValue_(7.0f),
      tdsValue_(0.0f),
      lastSampleMs_(0),
      display_(128, 64, &Wire, -1),
      ppmDisplay_(128, 64, &Wire, -1),
      tdsSensor_(tdsPin),
      serialPort_(nullptr),
      serialRxPin_(-1),
      serialTxPin_(-1),
      serialBaud_(115200),
      useSerial_(false),
      serialLine_() {
}

void PH4502C::beginSerial(HardwareSerial& serialPort, int rxPin, int txPin, uint32_t baud) {
    serialPort_ = &serialPort;
    serialRxPin_ = rxPin;
    serialTxPin_ = txPin;
    serialBaud_ = baud;
    useSerial_ = true;
    serialLine_.reserve(80);
    serialPort_->begin(serialBaud_, SERIAL_8N1, serialRxPin_, serialTxPin_);
}

bool PH4502C::parseSerialData() {
    if (!serialPort_ || !serialPort_->available()) {
        return false;
    }

    while (serialPort_->available()) {
        char c = static_cast<char>(serialPort_->read());
        if (c == '\n' || c == '\r') {
            if (serialLine_.length() == 0) {
                continue;
            }

            float ph = 0.0f;
            float mv = 0.0f;
            int raw = 0;
            if (sscanf(serialLine_.c_str(), "PH=%f,MV=%f,RAW=%d", &ph, &mv, &raw) == 3) {
                phValue_ = ph;
                voltageMv_ = mv;
                rawAdc_ = raw;
                serialLine_.clear();
                return true;
            }
            serialLine_.clear();
        } else if (serialLine_.length() < 80) {
            serialLine_ += c;
        }
    }

    return false;
}

bool PH4502C::begin() {
    analogSetPinAttenuation(analogPin_, ADC_11db);
    analogReadResolution(12);

    Wire.begin(i2cSda_, i2cScl_);
    if (!display_.begin(SSD1306_SWITCHCAPVCC, oledAddress_)) {
        return false;
    }
    if (!ppmDisplay_.begin(SSD1306_SWITCHCAPVCC, ppmOledAddress_)) {
        return false;
    }

    tdsSensor_.begin();

    display_.clearDisplay();
    display_.setTextColor(SSD1306_WHITE);
    display_.setTextSize(1);
    display_.setCursor(0, 0);
    display_.println("PH-4502C Ready");
    display_.println("Monitoring...");
    display_.display();

    ppmDisplay_.clearDisplay();
    ppmDisplay_.setTextColor(SSD1306_WHITE);
    ppmDisplay_.setTextSize(1);
    ppmDisplay_.setCursor(0, 0);
    ppmDisplay_.println("PPM/TDS Monitor");
    ppmDisplay_.println("Ready...");
    ppmDisplay_.display();

    delay(800);
    lastSampleMs_ = millis();
    return true;
}

void PH4502C::update() {
    if (millis() - lastSampleMs_ < 750) {
        return;
    }

    lastSampleMs_ = millis();
    if (!useSerial_ || !parseSerialData()) {
        sampleSensor();
    }
    tdsValue_ = tdsSensor_.readTDS();
    drawDisplay();
    drawPpmDisplay();
}

float PH4502C::getPH() const {
    return phValue_;
}

float PH4502C::getTDS() const {
    return tdsSensor_.readTDS();
}

float PH4502C::getVoltageMillivolts() const {
    return voltageMv_;
}

int PH4502C::getRawADC() const {
    return rawAdc_;
}

void PH4502C::setCalibrationOffset(float offsetMillivolts) {
    calibrationOffsetMv_ = offsetMillivolts;
}

void PH4502C::sampleSensor() {
    long total = 0;
    const int samples = 8;
    for (int i = 0; i < samples; ++i) {
        total += analogRead(analogPin_);
        delay(5);
    }

    rawAdc_ = total / samples;
    voltageMv_ = rawToMillivolts(rawAdc_);
    phValue_ = millivoltsToPH(voltageMv_);
}

float PH4502C::rawToMillivolts(int raw) const {
    return raw * (3300.0f / 4095.0f);
}

float PH4502C::millivoltsToPH(float millivolts) const {
    return 7.0f + ((millivolts + calibrationOffsetMv_) - 1500.0f) / 59.16f;
}

void PH4502C::drawDisplay() {
    char buffer[32];

    display_.clearDisplay();
    display_.setTextSize(1);
    display_.setCursor(0, 0);
    display_.println("PH-4502C Monitor");
    display_.println();

    display_.setTextSize(2);
    display_.setCursor(0, 18);
    snprintf(buffer, sizeof(buffer), "PH: %.2f", phValue_);
    display_.println(buffer);

    display_.setTextSize(1);
    display_.setCursor(0, 50);
    snprintf(buffer, sizeof(buffer), "ADC: %4d", rawAdc_);
    display_.println(buffer);
    snprintf(buffer, sizeof(buffer), "Voltage: %.0fmV", voltageMv_);
    display_.println(buffer);
    display_.display();
}

void PH4502C::drawPpmDisplay() {
    char buffer[32];

    ppmDisplay_.clearDisplay();
    ppmDisplay_.setTextSize(1);
    ppmDisplay_.setCursor(0, 0);
    ppmDisplay_.println("PPM/TDS Monitor");
    ppmDisplay_.println();

    ppmDisplay_.setTextSize(2);
    ppmDisplay_.setCursor(0, 18);
    snprintf(buffer, sizeof(buffer), "TDS: %.0f", tdsValue_);
    ppmDisplay_.println(buffer);

    ppmDisplay_.setTextSize(1);
    ppmDisplay_.setCursor(0, 50);
    ppmDisplay_.println("ppm");
    ppmDisplay_.display();
}
