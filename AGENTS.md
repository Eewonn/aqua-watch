# Repository Guidelines

## Project Structure & Module Organization

- `feeding-nimo code/`: ESP32 PlatformIO firmware. Source files live in `src/`, headers in `include/`, and board settings in `platformio.ini`.
- `api/`: Next.js API/dashboard. Routes are under `app/api/`, Supabase setup is in `lib/supabase.ts`, and static assets are in `public/`. Read `api/AGENTS.md` before changing Next.js code.
- `mobile/`: Expo React Native app. Screens are in `app/`, helpers in `lib/`, constants in `constants/`, and icons/splash assets in `assets/`.
- `supabase/schema.sql`: Database schema for the backend.

## Build, Test, and Development Commands

Run commands from the relevant subdirectory. `api/` and `mobile/` have separate lockfiles.

- `cd api && npm install`: Install backend dependencies.
- `cd api && npm run dev`: Start Next.js locally.
- `cd api && npm run build`: Build and type-check production output.
- `cd api && npm run start`: Run the built app.
- `cd mobile && npm install`: Install mobile dependencies.
- `cd mobile && npm start`: Start Expo.
- `cd mobile && npm run android|ios|web`: Launch Expo for a target platform.
- `cd "feeding-nimo code" && platformio run`: Build the ESP32 firmware.
- `cd "feeding-nimo code" && platformio run --target upload`: Upload firmware.

## Coding Style & Naming Conventions

TypeScript projects use strict mode. Keep React components in `PascalCase`, route files named by framework convention, and helpers in lower-case or camelCase files. API code currently uses 2-space indentation, single quotes, and no semicolons.

Firmware uses C++/Arduino style with headers in `include/` and implementations in `src/`. Keep hardware pin and timing constants near the top of firmware modules.

## Testing Guidelines

No automated test or lint scripts are currently defined in `api/package.json` or `mobile/package.json`. Before opening a PR, run `npm run build` in `api` and manually exercise affected Expo screens. For firmware, run `platformio run`; when hardware behavior changes, document the ESP32 board and sensors used.

## Commit & Pull Request Guidelines

Git history contains only `Initial Commit`, so there is no established convention yet. Use concise imperative subjects, for example `Add readings history endpoint`.

Pull requests should include a summary, testing performed, linked issue or task when available, and screenshots or recordings for mobile/UI changes. For firmware, include hardware verification notes.

## Security & Configuration Tips

Avoid committing production secrets, Supabase keys, or permanent device credentials. Firmware keeps Wi-Fi, API base, and device ID constants in `feeding-nimo code/src/main.cpp` to match the client workflow. Backend configuration uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
