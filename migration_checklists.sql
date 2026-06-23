-- PHL CRM: Checklists + Document Settings Migration
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/gmblbltckwipghqutkhw/editor

-- ──────────────────────────────────────────────
-- 1. Add document_settings column to org_settings
-- ──────────────────────────────────────────────
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS document_settings JSONB DEFAULT '{}';

-- ──────────────────────────────────────────────
-- 2. Checklist Templates
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  division    TEXT,
  description TEXT,
  items       JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='checklist_templates' AND policyname='ck_tmpl_all') THEN
    CREATE POLICY ck_tmpl_all ON checklist_templates FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed 3 starter templates
INSERT INTO checklist_templates (name, division, description, items)
SELECT * FROM (VALUES
  ('Lawn Mow Quality Check', 'Lawn & Tree', 'Standard post-mow inspection', '[{"label":"Edging completed on all curbs and beds","checked":false},{"label":"Trimming done around obstacles (trees, signs, fences)","checked":false},{"label":"Clippings blown off driveway and walkways","checked":false},{"label":"No turf scalping or missed strips","checked":false},{"label":"Gate latched on exit","checked":false},{"label":"Job site photos taken","checked":false}]'::jsonb),
  ('Irrigation Service Check', 'Irrigation', 'Post-service irrigation inspection', '[{"label":"All zones tested and cycling","checked":false},{"label":"Broken heads replaced or flagged","checked":false},{"label":"Controller programmed and confirmed","checked":false},{"label":"No surface flooding observed after run","checked":false},{"label":"Shut-off valve returned to open position","checked":false},{"label":"Client notified of any issues found","checked":false}]'::jsonb),
  ('Pest Control Application', 'Extermination', 'Pesticide application checklist', '[{"label":"PPE worn throughout application","checked":false},{"label":"Target areas treated per work order","checked":false},{"label":"Product used and rate logged","checked":false},{"label":"Re-entry interval communicated to client","checked":false},{"label":"Application log completed","checked":false},{"label":"Property inspection for evidence of activity","checked":false}]'::jsonb)
) AS v(name, division, description, items)
WHERE NOT EXISTS (SELECT 1 FROM checklist_templates LIMIT 1);

-- ──────────────────────────────────────────────
-- 3. Job Checklists (active instances)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_checklists (
  id            SERIAL PRIMARY KEY,
  job_id        INTEGER,
  job_title     TEXT,
  client_name   TEXT,
  template_id   INTEGER REFERENCES checklist_templates(id) ON DELETE SET NULL,
  template_name TEXT,
  items         JSONB NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'not_started'
                  CHECK (status IN ('not_started','in_progress','completed')),
  notes         TEXT,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE job_checklists ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='job_checklists' AND policyname='job_ck_all') THEN
    CREATE POLICY job_ck_all ON job_checklists FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Auto-set completed_at
CREATE OR REPLACE FUNCTION set_checklist_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.completed_at = now();
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_ck_updated ON job_checklists;
CREATE TRIGGER trg_job_ck_updated
  BEFORE UPDATE ON job_checklists
  FOR EACH ROW EXECUTE FUNCTION set_checklist_completed_at();

-- ──────────────────────────────────────────────
-- ROLLBACK:
-- DROP TABLE IF EXISTS job_checklists;
-- DROP TABLE IF EXISTS checklist_templates;
-- ALTER TABLE org_settings DROP COLUMN IF EXISTS document_settings;
-- ──────────────────────────────────────────────
