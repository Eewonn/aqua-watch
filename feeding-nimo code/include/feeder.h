#ifndef FEEDER_H
#define FEEDER_H

#include <ESP32Servo.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <LiquidCrystal_I2C.h>

class Feeder {
public:
    Feeder(int servoPin, int upPin, int setPin, int downPin, int lcdAddr = 0x27);
    void begin();
    void update();
    void setFeedingTime(int hour, int minute);
    int getFeedingHour();
    int getFeedingMinute();
    void spinServoPublic(); // for remote feed commands

private:
    Servo servo;
    int servoPin;
    int upPin, setPin, downPin;
    LiquidCrystal_I2C lcd;
    WiFiUDP ntpUDP;
    NTPClient timeClient;
    bool wifiConnected;
    int feedingHour;
    int feedingMinute;
    unsigned long lastCheck;
    enum State { NORMAL, SET_HOUR, SET_MINUTE };
    State currentState;
    bool upPressed, setPressed, downPressed;
    void handleButtons();
    void spinServo();
    void updateDisplay(int currentHour, int currentMinute);
};

#endif
