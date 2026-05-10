#include "TDSSensor.h"

TDSSensor::TDSSensor(int sensorPin, float calFactor) : pin(sensorPin), calibrationFactor(calFactor) {}

void TDSSensor::begin() {
    // No specific initialization needed for analog read
}

float TDSSensor::readTDS() const {
    int analogValue = analogRead(pin);
    float voltage = analogValue * (3.3 / 4095.0); // ESP32 ADC is 12-bit
    float tdsValue = voltage * calibrationFactor;
    return tdsValue;
}

bool TDSSensor::isTDSInRange(float minTDS, float maxTDS) const {
    float tds = readTDS();
    return (tds >= minTDS && tds <= maxTDS);
}