-- AquaWatch schema

-- Sensor readings from ESP32
CREATE TABLE readings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  ph numeric(4,2),
  tds numeric(8,2),       -- ppm
  food_level numeric(5,2), -- percentage 0-100
  created_at timestamptz DEFAULT now()
);

CREATE INDEX readings_device_id_created_at_idx ON readings (device_id, created_at DESC);

-- Log of all feeding events
CREATE TABLE feed_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('manual', 'scheduled')),
  created_at timestamptz DEFAULT now()
);

-- Pending feed commands for ESP32 to pick up
CREATE TABLE feed_commands (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  executed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX feed_commands_device_pending_idx ON feed_commands (device_id, executed) WHERE executed = false;

-- User-defined feeding schedules (stored on backend, ESP32 picks up)
CREATE TABLE feed_schedule (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  time text NOT NULL,     -- "HH:MM" 24h format
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
