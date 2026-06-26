-- PHL CRM: Scanner Station Tables
-- Run in: https://supabase.com/dashboard/project/gmblbltckwipghqutkhw/editor

-- ── Scanner stations registry ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scanner_stations (
  id           SERIAL PRIMARY KEY,
  station_id   TEXT UNIQUE NOT NULL,  -- e.g. "warehouse-main", "warehouse-dock"
  label        TEXT NOT NULL,         -- human name shown in CRM
  location     TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  last_ping    TIMESTAMPTZ,
  last_employee TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE scanner_stations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='scanner_stations' AND policyname='scanner_stations_all') THEN
    CREATE POLICY scanner_stations_all ON scanner_stations FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed the 2 initial stations
INSERT INTO scanner_stations (station_id, label, location)
VALUES
  ('warehouse-main', 'Warehouse — Main Entrance', 'North Palm Beach warehouse, front door'),
  ('warehouse-dock', 'Warehouse — Loading Dock',  'North Palm Beach warehouse, rear dock')
ON CONFLICT (station_id) DO NOTHING;

-- ── Scanner events audit log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scanner_events (
  id              SERIAL PRIMARY KEY,
  employee_id_raw TEXT,
  employee_name   TEXT,
  station         TEXT,
  action          TEXT,   -- 'in', 'out', 'not_found'
  status          TEXT,   -- 'success', 'not_found', 'error'
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE scanner_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='scanner_events' AND policyname='scanner_events_all') THEN
    CREATE POLICY scanner_events_all ON scanner_events FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scanner_events_scanned ON scanner_events (scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scanner_events_emp ON scanner_events (employee_id_raw);

-- ── Add SCANNER_SECRET to Supabase Edge Function secrets ──────────────────
-- After running this SQL, go to:
-- Supabase → Edge Functions → scanner-clockin → Secrets
-- Add: SCANNER_SECRET = phl-scanner-2024
-- (or pick your own — must match the value in phl_scanner.py)
