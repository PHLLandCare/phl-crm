-- migration: create jobs table for PHL CRM
-- Run in Supabase SQL Editor if you don't already have a jobs table.
-- If you already have a jobs table, skip this and use Jobs.tsx directly.

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT UNIQUE NOT NULL,  -- e.g. JOB-001
  title TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','in_progress','completed','cancelled','on_hold')),
  job_type TEXT,  -- 'lawn_care' | 'landscaping' | 'irrigation' | 'tree_service' | 'pest_control' | 'other'
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  service_address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  instructions TEXT,         -- internal crew instructions
  customer_notes TEXT,       -- visible to client
  quote_id UUID,             -- link back to approved quote if converted
  invoice_id UUID,           -- link forward to generated invoice
  total_amount NUMERIC(10,2) DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-increment job number via sequence
CREATE SEQUENCE IF NOT EXISTS jobs_number_seq START 1;

CREATE OR REPLACE FUNCTION set_job_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    NEW.job_number := 'JOB-' || LPAD(nextval('jobs_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_job_number ON jobs;
CREATE TRIGGER trg_set_job_number
  BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_job_number();

-- updated_at trigger (reuse or create)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS (adjust to match your existing auth pattern)
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- If you don't use org_id yet, use this open policy for development:
CREATE POLICY "allow_all_for_now" ON jobs
  USING (true) WITH CHECK (true);

-- ROLLBACK:
-- DROP TABLE IF EXISTS jobs CASCADE;
-- DROP SEQUENCE IF EXISTS jobs_number_seq;
