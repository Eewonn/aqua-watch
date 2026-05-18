# Feeding Nimo Local Network Debugging Guide

Feeding Nimo now runs without Supabase or a deployed backend. The phone app talks directly to the ESP32 on the local network.

## Current Architecture

- ESP32 hosts a setup portal on `http://192.168.4.1` while the phone is connected to the `Feeding Nimo Setup` hotspot.
- After Wi-Fi configuration, the ESP32 starts its local control server on port `8020`.
- The mobile app scans common local subnets and `feeding-nimo.local:8020` until it finds a device that responds to `/status`.
- Readings are live device responses. Short graph history is kept in app memory only.
- Schedules are stored on the ESP32 using `Preferences`.

## ESP32 Endpoints

Use these from a browser, curl, or the mobile app after discovering the device IP.

```sh
curl "http://<device-ip>:8020/status"
curl "http://<device-ip>:8020/schedule?hour=4&minute=46"
curl "http://<device-ip>:8020/schedule?clear=1"
curl "http://<device-ip>:8020/settime?hour=4&minute=50&second=22"
curl "http://<device-ip>:8020/feed"
```

Expected `/status` response:

```json
{
  "time": "04:50:22",
  "weight": 0.4,
  "level": "LOW",
  "ph": 8.82,
  "safety": "UNSAFE",
  "schedule": [
    {
      "hour": 4,
      "minute": 46
    }
  ]
}
```

## Setup Flow

1. Power the ESP32.
2. If it has no saved Wi-Fi credentials, connect the phone to `Feeding Nimo Setup`.
3. Open Settings in the app.
4. Tap `Scan` under Device Setup to ask the ESP32 for nearby Wi-Fi networks.
5. Select the router SSID, enter the password, and send settings.
6. Reconnect the phone to the same router.
7. Tap `Scan for Hardware`.
8. In Feeder, tap `Sync Device Time` before relying on schedules.

## Troubleshooting

### App cannot scan setup Wi-Fi networks

- Confirm the phone is connected to `Feeding Nimo Setup`.
- Confirm `http://192.168.4.1/networks` opens while connected to the setup hotspot.
- Reboot the ESP32 if the setup hotspot does not appear.

### App cannot find hardware

- Confirm the phone and ESP32 are on the same Wi-Fi network.
- Check the serial monitor for the ESP32 local IP and port `8020`.
- Try `http://<device-ip>:8020/status` from a browser on the same network.
- Some routers block client-to-client traffic. Disable AP/client isolation for the Wi-Fi network.

### Schedules do not run

- Tap `Sync Device Time` in the Feeder tab.
- Confirm `/status` shows the expected `time`.
- Confirm `/status` includes the schedule entry.
- Keep the ESP32 powered. Schedules are checked by the ESP32 clock.

### Readings look wrong

- `/status` is the source of truth for app display.
- pH safety is `SAFE` only from `6.5` to `8.5`.
- Food `level` is derived by the load cell module and is displayed as `LOW`, `MEDIUM`, or `HIGH`.
- TDS is no longer part of the firmware, app, or local JSON contract.

## Build Checks

Run these before handoff:

```sh
cd "feeding-nimo code" && platformio run
cd mobile && npm run web
cd api && npm run build
```

The `api/` folder is now only a local/web dashboard client for the ESP32. It should not require Supabase environment variables.
