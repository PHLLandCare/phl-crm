-- Migration: create payments table + add paid_at to invoices
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS payments (
  id            bigserial PRIMARY KEY,
  invoice_id    text        NOT NULL,
  invoice_number text,
  client_name   text,
  amount        numeric     NOT NULL,
  method        text        NOT NULL DEFAULT 'Square',
  note          text,
  paid_at       timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Add paid_at to invoices if not already there
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- RLS: allow all authenticated users to read/write payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_all" ON payments;
CREATE POLICY "payments_all" ON payments FOR ALL USING (true) WITH CHECK (true);

-- Index for fast lookups by invoice
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments(invoice_id);
