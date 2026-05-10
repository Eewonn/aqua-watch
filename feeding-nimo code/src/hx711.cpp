#include "hx711.h"
#include <Arduino.h>

LoadCell::LoadCell(int doutPin, int sckPin, int ledLowPin, int ledMediumPin, int ledHighPin)
    : doutPin(doutPin), sckPin(sckPin), ledLowPin(ledLowPin), ledMediumPin(ledMediumPin), ledHighPin(ledHighPin),
      calibrationFactor(1.0), maxWeight(1.0) {
}

void LoadCell::begin() {
    scale.begin(doutPin, sckPin);
    pinMode(ledLowPin, OUTPUT);
    pinMode(ledMediumPin, OUTPUT);
    pinMode(ledHighPin, OUTPUT);
    digitalWrite(ledLowPin, LOW);
    digitalWrite(ledMediumPin, LOW);
    digitalWrite(ledHighPin, LOW);
    tare();
    // Default calibration factor - needs to be calibrated for your load cell
    // To calibrate: tare(), place 1kg weight, read raw value, factor = 1000 / raw_value
    scale.set_scale(calibrationFactor);
}

void LoadCell::update() {
    FoodLevel level = getFoodLevel();
    updateLEDs(level);
}

float LoadCell::getWeight() {
    if (scale.is_ready()) {
        float weight = scale.get_units(10); // average of 10 readings
        return weight / 1000.0; // convert to kg (assuming calibration is in grams)
    }
    return 0.0;
}

float LoadCell::getWeightPercent() {
    float pct = (getWeight() / maxWeight) * 100.0f;
    if (pct < 0.0f) pct = 0.0f;
    if (pct > 100.0f) pct = 100.0f;
    return pct;
}

FoodLevel LoadCell::getFoodLevel() {
    float weight = getWeight();
    if (weight < 0.25) {
        return FOOD_LOW;
    } else if (weight < 0.75) {
        return FOOD_MEDIUM;
    } else {
        return FOOD_HIGH;
    }
}

void LoadCell::setCalibrationFactor(float factor) {
    calibrationFactor = factor;
    scale.set_scale(calibrationFactor);
}

void LoadCell::tare() {
    scale.tare();
}

void LoadCell::updateLEDs(FoodLevel level) {
    digitalWrite(ledLowPin, level == FOOD_LOW ? HIGH : LOW);
    digitalWrite(ledMediumPin, level == FOOD_MEDIUM ? HIGH : LOW);
    digitalWrite(ledHighPin, level == FOOD_HIGH ? HIGH : LOW);
}