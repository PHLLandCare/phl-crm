-- migration: Unique constraint on employee_details.user_id so the Team Details
-- tab (address/SSN/employee ID/paperwork) can safely upsert one row per
-- employee instead of accumulating duplicate rows on every save.
-- Run this in: Supabase Dashboard > SQL Editor

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_details_user_id_key'
  ) THEN
    ALTER TABLE employee_details ADD CONSTRAINT employee_details_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Rollback:
-- ALTER TABLE employee_details DROP CONSTRAINT employee_details_user_id_key;
