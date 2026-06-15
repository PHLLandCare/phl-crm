-- ============================================================
-- PHL CRM — RLS Hardening Migration
-- Run this in Supabase SQL Editor > New Query
--
-- Tightens tables that were found wide open (USING true / public)
-- to match the role-based access model used elsewhere
-- (get_my_role() with superadmin/manager/dispatcher/worker/worker_limited).
--
-- SAFE TO RUN: only touches policies, not table structure or data.
-- ============================================================


-- ============================================================
-- 1. org_settings — contains SignalWire/Square/SMTP secrets
--    Currently: {authenticated} USING (true) — any logged-in user
--    (including worker_limited) can read/write API keys & passwords.
--
--    Fix: only superadmin/manager can read/write the full row.
--
--    The Client Portal (anonymous, no login) needs square_app_id and
--    square_location_id to initialize the Square card form — these are
--    publishable/public-safe IDs (like a Stripe publishable key), NOT
--    secrets. We expose just those two columns via a view that anon
--    can read, while the base table stays locked to admins.
-- ============================================================

DROP POLICY IF EXISTS "authenticated can manage org_settings" ON org_settings;

CREATE POLICY "manager_superadmin_full_org_settings" ON org_settings
  FOR ALL
  USING (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text]))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text]));

-- Public-safe view exposing only Square's publishable IDs for the
-- unauthenticated Client Portal payment form.
CREATE OR REPLACE VIEW org_settings_public AS
  SELECT square_app_id, square_location_id
  FROM org_settings
  LIMIT 1;

GRANT SELECT ON org_settings_public TO anon, authenticated;


-- ============================================================
-- 2. settings — currently {public} USING (auth.role() = 'authenticated')
--    Any logged-in user (including worker_limited) can read/write.
--    Restrict to superadmin/manager, matching org_settings.
-- ============================================================

DROP POLICY IF EXISTS "Allow all for authenticated users" ON settings;

CREATE POLICY "manager_superadmin_full_settings" ON settings
  FOR ALL
  USING (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text]))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text]));


-- ============================================================
-- 3. payments — currently {public} USING (true), fully open even
--    to anonymous requests. Contains payment records tied to invoices.
--
--    Needed by:
--      - InvoicesPage (staff, authenticated) — full access for managers
--      - ClientPortalPage (anonymous) — INSERT only, when a client pays
--        their own invoice via the portal
--
--    Fix: staff (superadmin/manager) get full access; anon/authenticated
--    can INSERT (record a payment from the portal) but not read/update/
--    delete other payment records.
-- ============================================================

DROP POLICY IF EXISTS "payments_all" ON payments;

CREATE POLICY "manager_superadmin_full_payments" ON payments
  FOR ALL
  USING (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text]))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text]));

CREATE POLICY "anon_authenticated_insert_payments" ON payments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);


-- ============================================================
-- 4. employee_documents — currently {public} USING (true), open to
--    anonymous requests. Holds employee paperwork (per invite-user
--    function — SSNs, tax forms, etc).
--
--    Fix: restrict to superadmin/manager, same pattern as
--    employee_details (which already has a correct policy).
-- ============================================================

DROP POLICY IF EXISTS "Admin access employee docs" ON employee_documents;

CREATE POLICY "manager_superadmin_full_employee_documents" ON employee_documents
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_profiles.id FROM user_profiles
      WHERE user_profiles.role = ANY (ARRAY['superadmin'::text, 'manager'::text])
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT user_profiles.id FROM user_profiles
      WHERE user_profiles.role = ANY (ARRAY['superadmin'::text, 'manager'::text])
    )
  );


-- ============================================================
-- 5. call_logs / sms_logs / fax_logs — currently {anon,authenticated}
--    USING (true), fully open including to anonymous requests.
--    These are written by the Dialer (signalwire-call / send-sms /
--    send-fax edge functions) and read by DialerPage (staff only).
--
--    Fix: only authenticated staff with view access (everyone except
--    worker_limited, matching view_jobs-style permission level) can
--    read/write. Removes anon access entirely — these edge functions
--    run server-side with service_role, which bypasses RLS anyway, so
--    anon access was never required for the functions to work.
-- ============================================================

DROP POLICY IF EXISTS "allow_all_call_logs" ON call_logs;
DROP POLICY IF EXISTS "allow_all_sms_logs"  ON sms_logs;
DROP POLICY IF EXISTS "allow_all_fax_logs"  ON fax_logs;

CREATE POLICY "staff_full_call_logs" ON call_logs
  FOR ALL
  TO authenticated
  USING (get_my_role() <> 'worker_limited')
  WITH CHECK (get_my_role() <> 'worker_limited');

CREATE POLICY "staff_full_sms_logs" ON sms_logs
  FOR ALL
  TO authenticated
  USING (get_my_role() <> 'worker_limited')
  WITH CHECK (get_my_role() <> 'worker_limited');

CREATE POLICY "staff_full_fax_logs" ON fax_logs
  FOR ALL
  TO authenticated
  USING (get_my_role() <> 'worker_limited')
  WITH CHECK (get_my_role() <> 'worker_limited');


-- ============================================================
-- 6. client_properties / property_contacts — currently {authenticated}
--    USING (true). Any logged-in user (incl. worker_limited) can edit
--    client property records and contacts.
--
--    Fix: restrict edit access to roles that can edit clients
--    (superadmin/manager/dispatcher per the app's view_clients/
--    edit_clients permission model); everyone authenticated can still
--    read (workers need to see property info for jobs they're assigned).
-- ============================================================

DROP POLICY IF EXISTS "authenticated can manage client_properties" ON client_properties;

CREATE POLICY "staff_read_client_properties" ON client_properties
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "dispatcher_and_up_write_client_properties" ON client_properties
  FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text, 'dispatcher'::text]));

CREATE POLICY "dispatcher_and_up_update_client_properties" ON client_properties
  FOR UPDATE
  TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text, 'dispatcher'::text]))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text, 'dispatcher'::text]));

CREATE POLICY "dispatcher_and_up_delete_client_properties" ON client_properties
  FOR DELETE
  TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text, 'dispatcher'::text]));


DROP POLICY IF EXISTS "authenticated can manage property_contacts" ON property_contacts;

CREATE POLICY "staff_read_property_contacts" ON property_contacts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "dispatcher_and_up_write_property_contacts" ON property_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text, 'dispatcher'::text]));

CREATE POLICY "dispatcher_and_up_update_property_contacts" ON property_contacts
  FOR UPDATE
  TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text, 'dispatcher'::text]))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text, 'dispatcher'::text]));

CREATE POLICY "dispatcher_and_up_delete_property_contacts" ON property_contacts
  FOR DELETE
  TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text, 'dispatcher'::text]));


-- ============================================================
-- 7. invoice_line_items — currently {anon,authenticated} USING (true).
--    Anon access not needed (line items only shown to staff in
--    InvoicesPage, or to clients via the e-sign portal which uses
--    jobs/quotes data, not this table directly). Restrict to
--    authenticated, matching invoices table's manager/superadmin gate
--    for write, but allow all authenticated to read (workers may need
--    to see line items for jobs they're completing).
-- ============================================================

DROP POLICY IF EXISTS "allow_all_invoice_line_items" ON invoice_line_items;

CREATE POLICY "staff_read_invoice_line_items" ON invoice_line_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "manager_superadmin_write_invoice_line_items" ON invoice_line_items
  FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text]));

CREATE POLICY "manager_superadmin_update_invoice_line_items" ON invoice_line_items
  FOR UPDATE
  TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text]))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text]));

CREATE POLICY "manager_superadmin_delete_invoice_line_items" ON invoice_line_items
  FOR DELETE
  TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin'::text, 'manager'::text]));


-- ============================================================
-- Verification: re-run the summary audit (Audit #11) after this
-- migration to confirm policy_count increased and no table is left
-- without a SELECT/INSERT/UPDATE-capable policy for staff roles.
-- ============================================================
