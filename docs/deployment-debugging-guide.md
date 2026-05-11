# Feeding Nimo Deployment and Remote Debugging Guide

This guide is for deployments where the client operates the Android APK and ESP32 hardware, while the developer maintains the software remotely. The goal is to make every failure traceable across four layers:

1. Mobile app
2. Backend API
3. Supabase database
4. ESP32 firmware and connected sensors

## System Overview

Feeding Nimo has three runtime components:

- **Mobile app**: Expo React Native APK used by the client for monitoring readings, triggering manual feeding, creating schedules, and configuring the ESP32 Wi-Fi setup flow.
- **Backend API**: Next.js API deployed to Vercel. It receives readings, stores schedules, creates feed commands, and exposes pending commands to the ESP32.
- **ESP32 firmware**: PlatformIO Arduino firmware that reads sensors, posts readings, polls pending commands, dispenses food, and marks commands executed.

Primary runtime flow:

1. ESP32 posts sensor data to `POST /api/readings`.
2. Mobile app reads latest/history from `GET /api/readings` and `GET /api/readings/history`.
3. Mobile app creates manual feed commands through `POST /api/feed`.
4. Mobile app creates schedules through `/api/schedule`.
5. ESP32 polls `GET /api/commands/pending?device_id=...`.
6. Backend queues due scheduled feeds when pending commands are polled.
7. ESP32 executes feed commands and calls `PATCH /api/commands/:id/execute`.

## Required Deployment Values

Keep these values in a deployment record for every client installation.

| Field | Example | Notes |
| --- | --- | --- |
| Client name/site | `Client A - Main Tank` | Use a human-readable location. |
| Device ID | `esp32-001` | Must match firmware/app/backend requests. |
| API base URL | `https://aqua-watch-backend.vercel.app` | Mobile app and firmware must use the same backend. |
| Setup hotspot SSID | `Feeding Nimo Setup` | Used only during device provisioning. |
| Setup hotspot password | `feedingnimo` | Used only during device provisioning. |
| Setup URL | `http://192.168.4.1` | Available only while connected to setup hotspot. |
| Supabase project | `<project name>` | Needed for database checks. |
| Vercel project | `<project name>` | Needed for API logs/deploys. |
| APK version | `1.0.0` | Record each APK sent to the client. |
| Firmware version | `<commit/date>` | Record the exact firmware flashed. |

## Pre-Deployment Checklist

Before sending the APK or hardware to the client:

- Run `cd api && npm run build`.
- Run `cd mobile && npx tsc --noEmit`.
- Run `cd "feeding-nimo code" && platformio run` on a machine with PlatformIO.
- Confirm Supabase tables exist from `supabase/schema.sql`.
- Confirm Vercel environment variables exist:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - Optional: `SCHEDULE_TIME_ZONE`, default is `Asia/Manila`
  - Optional: `CRON_SECRET`, if external cron calls are protected
- Confirm API CORS headers are present for `/api/:path*`.
- Confirm the APK points to the production API by default or document the URL the client must enter.
- Record the Git commit used for API, mobile APK, and firmware.
- Save a copy of the built APK with version/date in the filename.

## Client Installation Procedure

Give this exact sequence to the client.

1. Install the APK on the Android phone.
2. Power on the Feeding Nimo hardware.
3. If the device is not configured, connect phone Wi-Fi to:
   - SSID: `Feeding Nimo Setup`
   - Password: `feedingnimo`
4. Open the app and go to Settings.
5. Confirm Device Setup URL is `http://192.168.4.1`.
6. Tap Scan.
7. Select the client’s Wi-Fi network.
8. Enter Wi-Fi password.
9. Confirm API Base URL.
10. Confirm Device ID.
11. Tap Configure Feeding Nimo Device.
12. Reconnect the phone to the normal Wi-Fi or mobile data.
13. Confirm Monitor screen shows readings after the ESP32 posts data.

Important limitation: the app can detect Wi-Fi networks through the ESP32 setup hotspot, but it cannot automatically know the Wi-Fi password. The client must enter the password.

## Backend Deployment Procedure

Use this sequence for production API updates.

1. Commit all changes.
2. Push the API project to the connected Vercel repo/project.
3. Confirm Vercel build passes.
4. Open the deployment URL.
5. Check:
   - `GET /` returns `Feeding Nimo API`.
   - `GET /api/readings?device_id=esp32-001` returns either latest reading or `404 null`.
   - `GET /api/cron/feed-schedules` returns JSON, if cron is used.
6. Check Vercel Function Logs for runtime errors.
7. Record deployment timestamp and commit hash.

## APK Release Procedure

For every APK sent to the client:

- Version the APK filename, for example `feeding-nimo-v1.0.0-2026-05-11.apk`.
- Record:
  - APK filename
  - build date
  - Git commit
  - API URL expected by the APK
  - known limitations
- Send a short client changelog.
- Ask the client to confirm:
  - app opens
  - Settings screen loads
  - API Base URL is correct
  - Monitor screen can refresh
  - Feeder screen can create a manual command

## Remote Debugging Model

When something fails, identify which layer failed first.

### Layer 1: Mobile App

Common symptoms:

- App says connection issue.
- App shows `API request failed with status 404`.
- Feed Now says error.
- Schedule list does not load.
- Device setup scan fails.

Checks:

- Confirm API Base URL in app Settings.
- If testing against local API, phone must be on the same network as the computer.
- If testing against production API, use the deployed HTTPS Vercel URL.
- `404 null` from latest reading means no reading exists yet for that device ID. It is not a network failure.
- Browser/Expo Web CORS failures mean the backend deployment does not include current CORS config.

Ask client for:

- Screenshot of Settings screen.
- Screenshot of Monitor screen error.
- Device ID shown in Settings.
- API Base URL shown in Settings.
- Approximate time the issue happened.
- Whether they are using APK or browser/Expo Web.

### Layer 2: Backend API

Use Vercel logs first.

Check these endpoints:

```bash
curl "https://<api-domain>/api/readings?device_id=esp32-001"
curl "https://<api-domain>/api/readings/history?device_id=esp32-001&limit=5"
curl "https://<api-domain>/api/commands/pending?device_id=esp32-001"
curl "https://<api-domain>/api/schedule?device_id=esp32-001"
```

Create a test reading:

```bash
curl -X POST "https://<api-domain>/api/readings" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"esp32-001","ph":7.4,"tds":320,"food_level":80}'
```

Create a manual feed command:

```bash
curl -X POST "https://<api-domain>/api/feed" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"esp32-001"}'
```

If API requests fail:

- Check Vercel environment variables.
- Check Supabase service role key validity.
- Check Supabase table existence.
- Check CORS headers for browser/Expo Web use.
- Check whether the request has the expected `device_id`.

### Layer 3: Supabase

Use Supabase Table Editor or SQL editor.

Latest readings:

```sql
select *
from readings
where device_id = 'esp32-001'
order by created_at desc
limit 20;
```

Pending feed commands:

```sql
select *
from feed_commands
where device_id = 'esp32-001'
order by created_at desc
limit 20;
```

Feed log:

```sql
select *
from feed_log
where device_id = 'esp32-001'
order by created_at desc
limit 20;
```

Schedules:

```sql
select *
from feed_schedule
where device_id = 'esp32-001'
order by time asc;
```

Interpretation:

- Readings increasing over time: ESP32 can reach API and sensors are posting.
- Manual command inserted but not executed: ESP32 is not polling or cannot reach API.
- Command executed true but feeder did not move: firmware reached API, likely servo/mechanical/power issue.
- Schedule exists but no command created: check schedule time, timezone, and whether ESP32 is polling `/api/commands/pending`.
- Feed log has `scheduled` rows: schedule queueing is happening.

### Layer 4: ESP32 Hardware and Firmware

Ask the client to provide serial monitor logs when possible. If they cannot, ask for phone video of:

- OLED/LCD display during boot
- setup hotspot availability
- app setup scan/configure flow
- feeder movement after Feed Now
- sensor wiring and power

Expected boot behavior:

1. ESP32 starts.
2. If configured, it connects to saved Wi-Fi.
3. If not configured or Wi-Fi fails, it starts `Feeding Nimo Setup`.
4. Once connected, it posts initial reading.
5. It posts readings every 5 minutes.
6. It polls commands every 10 seconds.

Expected serial log patterns:

- `Feeding Nimo started`
- `Connecting to WiFi SSID: ...`
- `WiFi connected: ...`
- `Setup AP started: Feeding Nimo Setup at 192.168.4.1`
- `POST /api/readings -> 201`
- `GET /api/commands/pending -> 200`
- `Executing command <id>`
- `PATCH execute -> 200`

## Debugging Playbooks

### App Shows Connection Issue

1. Check API Base URL in Settings.
2. Test API URL from browser.
3. Run latest-reading curl.
4. If curl returns `404 null`, seed a test reading or wait for hardware.
5. If curl fails, check Vercel logs and env vars.
6. If only Expo Web fails, check CORS deployment.

### App Shows Offline

Offline means the latest reading is older than the app’s freshness window.

1. Check latest `readings.created_at`.
2. If old, ESP32 is not posting.
3. Ask client if hardware is powered.
4. Ask if Wi-Fi changed.
5. Ask client to look for `Feeding Nimo Setup` hotspot.
6. If setup hotspot appears, reconfigure Wi-Fi.

### Feed Now Does Not Move Servo

1. Tap Feed Now in app.
2. Check `feed_commands`.
3. If no command exists, API or mobile request failed.
4. If command exists and `executed = false`, ESP32 is not polling.
5. If command exists and `executed = true`, firmware executed the command and issue is likely servo wiring, servo power, mechanical jam, or insufficient current.
6. Ask client for video of servo and power wiring.

### Schedule Does Not Trigger

1. Check schedule row exists and `enabled = true`.
2. Confirm schedule time is in backend timezone. Default: `Asia/Manila`.
3. Check whether ESP32 is polling pending commands.
4. Check `feed_log` for `scheduled` entries.
5. Check `feed_commands` for generated command.
6. If no command is generated, call:

```bash
curl "https://<api-domain>/api/cron/feed-schedules"
```

7. If cron route generates command, scheduled queueing works; polling timing or deployment cron may be the issue.

### Device Setup Scan Fails

1. Confirm client is connected to `Feeding Nimo Setup`.
2. Confirm setup URL is `http://192.168.4.1`.
3. Open `http://192.168.4.1/networks` in browser while connected to setup hotspot.
4. If browser cannot open it, firmware is not in setup mode or hardware is unreachable.
5. Power cycle ESP32.
6. If setup hotspot does not appear, firmware may already be connected to Wi-Fi, or the AP did not start.

### Readings Look Wrong

1. Check if values are plausible:
   - pH normally around 6.5-8.5 depending on tank.
   - TDS depends on tank and water source.
   - Food level should be 0-100.
2. Ask for sensor calibration details.
3. Ask for photo/video of wiring.
4. Check if readings are constant, noisy, or out of range.
5. Constant values usually indicate sensor disconnection, ADC issue, or code reading a default value.
6. Very noisy values usually indicate grounding/power/sensor calibration problems.

## Minimum Client Support Packet

When the client reports an issue, ask for this packet:

- APK version.
- Device ID.
- API Base URL in app Settings.
- Screenshot of the failing screen.
- Exact time issue happened.
- Whether hardware is powered.
- Whether `Feeding Nimo Setup` hotspot is visible.
- Wi-Fi network name the hardware should use.
- Short video of hardware booting.
- Short video of feeder after pressing Feed Now.
- If possible, serial monitor logs.

## Recommended Observability Upgrades

The current system can be debugged through API responses and database rows, but long-term remote maintenance will be easier with dedicated telemetry.

Before handing the system to a client, prioritize the first three upgrades below. Without them, remote debugging is still possible, but you will depend heavily on screenshots, videos, and Supabase table inspection.

Recommended additions:

1. **Device heartbeat table**
   - `device_id`
   - firmware version
   - IP address
   - Wi-Fi RSSI
   - free heap
   - uptime seconds
   - last error
   - created_at

2. **Firmware event log endpoint**
   - ESP32 posts events such as boot, Wi-Fi connected, Wi-Fi failed, reading posted, command polled, command executed, servo error.

3. **Command execution audit**
   - Add `executed_at`, `attempt_count`, and `last_error` to `feed_commands`.

4. **App diagnostics screen**
   - Show API Base URL, Device ID, latest API status, latest reading timestamp, and pending command count.

5. **Firmware version display**
   - Store firmware version in code and post it with heartbeat/readings.

6. **Remote reset/provisioning command**
   - Add a protected command type that clears Wi-Fi credentials and restarts setup mode.

7. **Alerting**
   - Alert when no readings have arrived for more than 15 minutes.
   - Alert when pending commands remain unexecuted for more than 1 minute.
   - Alert when food level is below threshold.

## Suggested Remote Log Events

When firmware event logging is added, use consistent event names so logs can be filtered quickly.

| Event | When to send | Useful fields |
| --- | --- | --- |
| `boot` | ESP32 startup | firmware version, reset reason, uptime |
| `wifi_connect_start` | Before Wi-Fi connection attempt | SSID, device ID |
| `wifi_connect_success` | Wi-Fi connected | local IP, RSSI |
| `wifi_connect_failed` | Wi-Fi failed | SSID, status/error |
| `setup_portal_started` | Setup hotspot starts | AP SSID, setup IP |
| `reading_post_success` | Reading posted | pH, TDS, food level, HTTP status |
| `reading_post_failed` | Reading post failed | HTTP status/error, attempt count |
| `command_poll_success` | Pending commands fetched | command count |
| `command_poll_failed` | Polling failed | HTTP status/error |
| `feed_command_started` | Servo command begins | command ID |
| `feed_command_completed` | Servo command ends | command ID, duration |
| `feed_command_mark_failed` | Execute PATCH failed | command ID, HTTP status/error |

Minimum heartbeat interval: every 1 to 5 minutes. Minimum event retention: 7 to 30 days, depending on Supabase storage limits.

## Operational Rules

- Never diagnose from the app screen alone. Always correlate app state with API response and database rows.
- Treat `404 null` on latest reading as “no data yet,” not an outage.
- If manual command is created but not executed, focus on ESP32 connectivity.
- If command is executed but hardware did not move, focus on power, servo, wiring, or mechanics.
- If readings are old, focus on ESP32 Wi-Fi/API connectivity.
- Record every client issue with timestamp, device ID, API URL, APK version, and firmware version.
- Keep one known-good test device ID for backend validation.

## Quick Health Check

Run this after every deployment:

```bash
API="https://<api-domain>"
DEVICE="esp32-001"

curl "$API/"
curl "$API/api/readings?device_id=$DEVICE"
curl "$API/api/readings/history?device_id=$DEVICE&limit=5"
curl "$API/api/schedule?device_id=$DEVICE"
curl "$API/api/commands/pending?device_id=$DEVICE"
```

Expected:

- API root responds.
- Latest reading returns either JSON or `404 null`.
- History returns an array.
- Schedule returns an array.
- Pending commands returns an array.

## Handoff Notes for Client

Tell the client:

- Do not change the Device ID unless instructed.
- If Wi-Fi changes, re-run setup using `Feeding Nimo Setup`.
- If the app shows offline, check that the hardware is powered and Wi-Fi is working.
- If Feed Now does not move the feeder, report the time it was pressed and send a short hardware video.
- Do not share Supabase keys, Vercel credentials, or internal API secrets.
- The setup hotspot is only for configuration and may disappear after successful Wi-Fi connection.
