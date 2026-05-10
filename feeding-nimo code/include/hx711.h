#ifndef HX711_H
#define HX711_H

#include <HX711.h>

enum FoodLevel { FOOD_LOW, FOOD_MEDIUM, FOOD_HIGH };

class LoadCell {
public:
    LoadCell(int doutPin, int sckPin, int ledLowPin, int ledMediumPin, int ledHighPin);
    void begin();
    void update();
    float getWeight(); // in kg
    float getWeightPercent(); // 0–100 based on 1 kg max
    FoodLevel getFoodLevel();
    void setCalibrationFactor(float factor);
    void tare();

private:
    HX711 scale;
    int doutPin, sckPin;
    int ledLowPin, ledMediumPin, ledHighPin;
    float calibrationFactor;
    float maxWeight; // 1kg
    void updateLEDs(FoodLevel level);
};

#endif