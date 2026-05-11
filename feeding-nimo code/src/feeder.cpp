#include "feeder.h"
#include <WiFi.h>
#include <Wire.h>

Feeder::Feeder(int servoPin, int upPin, int setPin, int downPin, int lcdAddr)
    : servoPin(servoPin), upPin(upPin), setPin(setPin), downPin(downPin),
      ntpUDP(), timeClient(ntpUDP, "pool.ntp.org", 0, 60000), // update every 60 sec
      wifiConnected(false), feedingHour(12), feedingMinute(0), lastCheck(0), currentState(NORMAL),
      upPressed(false), setPressed(false), downPressed(false), lcd(lcdAddr, 16, 2) {
}

void Feeder::begin() {
    pinMode(upPin, INPUT_PULLUP);
    pinMode(setPin, INPUT_PULLUP);
    pinMode(downPin, INPUT_PULLUP);
    servo.attach(servoPin);
    servo.write(0); // initial position

    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.print("Feeder Starting...");
    lcd.setCursor(0, 1);
    lcd.print("Checking WiFi");

    if (WiFi.status() == WL_CONNECTED) {
        wifiConnected = true;
        lcd.clear();
        lcd.print("WiFi connected");
        lcd.setCursor(0, 1);
        lcd.print("Getting time...");
        timeClient.begin();
        timeClient.update();
    } else {
        wifiConnected = false;
        lcd.clear();
        lcd.print("WiFi failed");
        lcd.setCursor(0, 1);
        lcd.print("Continuing...");
    }
    delay(1000);
}

void Feeder::update() {
    wifiConnected = WiFi.status() == WL_CONNECTED;
    if (wifiConnected) {
        timeClient.update();
    }
    int currentHour = timeClient.getHours();
    int currentMinute = timeClient.getMinutes();

    // Check if time to feed
    static int lastFedHour = -1;
    static int lastFedMinute = -1;
    if (currentHour == feedingHour && currentMinute == feedingMinute &&
        (currentHour != lastFedHour || currentMinute != lastFedMinute)) {
        spinServo();
        lastFedHour = currentHour;
        lastFedMinute = currentMinute;
    }

    updateDisplay(currentHour, currentMinute);
    handleButtons();
}

void Feeder::spinServoPublic() {
    spinServo();
}

void Feeder::setFeedingTime(int hour, int minute) {
    feedingHour = hour;
    feedingMinute = minute;
}

int Feeder::getFeedingHour() {
    return feedingHour;
}

int Feeder::getFeedingMinute() {
    return feedingMinute;
}

void Feeder::handleButtons() {
    bool up = digitalRead(upPin) == LOW;
    bool set = digitalRead(setPin) == LOW;
    bool down = digitalRead(downPin) == LOW;

    if (set && !setPressed) {
        setPressed = true;
        if (currentState == NORMAL) {
            currentState = SET_HOUR;
        } else if (currentState == SET_HOUR) {
            currentState = SET_MINUTE;
        } else {
            currentState = NORMAL;
        }
    } else if (!set) {
        setPressed = false;
    }

    if (currentState == SET_HOUR) {
        if (up && !upPressed) {
            upPressed = true;
            feedingHour = (feedingHour + 1) % 24;
        } else if (!up) {
            upPressed = false;
        }
        if (down && !downPressed) {
            downPressed = true;
            feedingHour = (feedingHour + 23) % 24; // -1 mod 24
        } else if (!down) {
            downPressed = false;
        }
    } else if (currentState == SET_MINUTE) {
        if (up && !upPressed) {
            upPressed = true;
            feedingMinute = (feedingMinute + 1) % 60;
        } else if (!up) {
            upPressed = false;
        }
        if (down && !downPressed) {
            downPressed = true;
            feedingMinute = (feedingMinute + 59) % 60; // -1 mod 60
        } else if (!down) {
            downPressed = false;
        }
    }
}

void Feeder::spinServo() {
    if (!servo.attached()) {
        servo.attach(servoPin);
    }
    servo.write(90); // spin to dispense
    delay(1000); // 1 sec
    servo.write(0); // back
    delay(500); // settle
    servo.detach();
}

void Feeder::updateDisplay(int currentHour, int currentMinute) {
    lcd.clear();
    if (currentState == NORMAL) {
        lcd.setCursor(0, 0);
        lcd.printf("Time: %02d:%02d", currentHour, currentMinute);
        lcd.setCursor(0, 1);
        lcd.printf("Feed: %02d:%02d", feedingHour, feedingMinute);
    } else if (currentState == SET_HOUR) {
        lcd.setCursor(0, 0);
        lcd.printf("Set Hour: %02d", feedingHour);
        lcd.setCursor(0, 1);
        lcd.printf("Feed Min: %02d", feedingMinute);
    } else if (currentState == SET_MINUTE) {
        lcd.setCursor(0, 0);
        lcd.printf("Feed Hour: %02d", feedingHour);
        lcd.setCursor(0, 1);
        lcd.printf("Set Min: %02d", feedingMinute);
    }
}
