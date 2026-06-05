-- Run this in Supabase SQL Editor to create employee details table
CREATE TABLE IF NOT EXISTS employee_details (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  work_email text,
  personal_email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  ssn text,  -- Consider encrypting in production
  filing_status text,
  employee_type text DEFAULT 'W2',
  paperwork_files jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Also create storage buckets (run in Supabase Dashboard > Storage)
-- Bucket: employee-docs (private)
-- Bucket: expense-receipts (public)
-- Bucket: product-images (public)

ALTER TABLE employee_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage employee details" ON employee_details
  FOR ALL USING (auth.uid() IN (
    SELECT id FROM user_profiles WHERE role IN ('superadmin','manager')
  ));
