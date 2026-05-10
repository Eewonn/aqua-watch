#ifndef TDS_SENSOR_H
#define TDS_SENSOR_H

#include <Arduino.h>

class TDSSensor {
private:
    int pin;
    float calibrationFactor;

public:
    // Constructor
    TDSSensor(int sensorPin, float calFactor = 500.0);

    // Initialize the sensor (set pin mode if needed, but analogRead doesn't require)
    void begin();

    // Read TDS value in ppm
    float readTDS() const;

    // Optional: Check if TDS is within acceptable range for aquarium (example: 0-500 ppm)
    bool isTDSInRange(float minTDS = 0.0, float maxTDS = 500.0) const;
};

#endif // TDS_SENSOR_H