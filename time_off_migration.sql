-- migration: Add PTO/Sick/Vacation balances + time-off request workflow
-- Run this whole file in the PHL Land Care Supabase SQL Editor (project gmblbltckwipghqutkhw)

-- ── 1. Balance + approver columns on employees ──────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS pto_balance       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sick_balance      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacation_balance  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS time_off_approver_id uuid REFERENCES employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN employees.pto_balance IS 'Remaining PTO days, admin-adjusted manually';
COMMENT ON COLUMN employees.sick_balance IS 'Remaining sick days, admin-adjusted manually';
COMMENT ON COLUMN employees.vacation_balance IS 'Remaining vacation days, admin-adjusted manually';
COMMENT ON COLUMN employees.time_off_approver_id IS 'Optional override: specific employee who approves this person''s time-off requests. NULL = any admin/manager can approve.';

-- ── 2. time_off_requests table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_off_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   text NOT NULL,                 -- matches employees.employee_id (e.g. 'PHL-0001'), same pattern as clock_events
  employee_name text NOT NULL,
  type          text NOT NULL CHECK (type IN ('pto','sick','vacation')),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  days          numeric NOT NULL,              -- requested # of days, deducted from balance on approval
  reason        text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','cancelled')),
  reviewed_by   text,                           -- name of admin/manager who approved/denied
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_off_employee ON time_off_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_off_status ON time_off_requests(status);

-- set_updated_at trigger (re-uses pattern already used elsewhere in this DB)
CREATE OR REPLACE FUNCTION set_time_off_updated_at()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_time_off_updated_at ON time_off_requests;
CREATE TRIGGER trg_time_off_updated_at
  BEFORE UPDATE ON time_off_requests
  FOR EACH ROW EXECUTE FUNCTION set_time_off_updated_at();

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
-- Same access model as clock_events: Employee Portal logs in with employee_id only
-- (no Supabase Auth session), so this table must allow anon read/write, scoped
-- sensibly. Admin app (TeamPage etc.) uses Supabase Auth and is already trusted.
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view time off requests" ON time_off_requests;
CREATE POLICY "Anyone can view time off requests" ON time_off_requests
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create time off requests" ON time_off_requests;
CREATE POLICY "Anyone can create time off requests" ON time_off_requests
  FOR INSERT WITH CHECK (status = 'pending');  -- can only ever insert as pending, never pre-approved

DROP POLICY IF EXISTS "Anyone can update time off requests" ON time_off_requests;
CREATE POLICY "Anyone can update time off requests" ON time_off_requests
  FOR UPDATE USING (true);

-- Rollback:
-- DROP TABLE IF EXISTS time_off_requests;
-- ALTER TABLE employees DROP COLUMN IF EXISTS pto_balance, DROP COLUMN IF EXISTS sick_balance,
--   DROP COLUMN IF EXISTS vacation_balance, DROP COLUMN IF EXISTS time_off_approver_id;
