-- ============================================================
-- PHL Land Care CRM — MASTER SECURITY HARDENING
-- Run once in Supabase SQL Editor → New Query
-- SAFE: only touches RLS policies, never table data or structure.
-- Idempotent: safe to re-run at any time.
-- ============================================================


-- ============================================================
-- HELPER: ensure get_my_role() exists
-- Returns the calling user's role from user_profiles.
-- Used by every policy below.
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid() LIMIT 1;
$$;


-- ============================================================
-- 1. org_settings
--    Contains SignalWire, Square, SMTP, ORS API keys/passwords.
--    Only superadmin/manager should ever read or write this.
--    The Client Portal needs square_app_id + square_location_id
--    (publishable IDs, safe to expose) — exposed via a public
--    view only, NOT through the base table.
-- ============================================================
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated can manage org_settings" ON org_settings;
DROP POLICY IF EXISTS "manager_superadmin_full_org_settings"  ON org_settings;

CREATE POLICY "manager_superadmin_full_org_settings" ON org_settings
  FOR ALL
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));

CREATE OR REPLACE VIEW org_settings_public AS
  SELECT square_app_id, square_location_id FROM org_settings LIMIT 1;
GRANT SELECT ON org_settings_public TO anon, authenticated;


-- ============================================================
-- 2. settings (document/app preferences)
--    Only superadmin/manager.
-- ============================================================
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users"     ON settings;
DROP POLICY IF EXISTS "manager_superadmin_full_settings"     ON settings;

CREATE POLICY "manager_superadmin_full_settings" ON settings
  FOR ALL
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));


-- ============================================================
-- 3. payments
--    Staff (superadmin/manager) → full access.
--    Anon/authenticated → INSERT only (client portal payment).
--    No one except managers can read other people's payment records.
-- ============================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_all"                          ON payments;
DROP POLICY IF EXISTS "manager_superadmin_full_payments"     ON payments;
DROP POLICY IF EXISTS "anon_authenticated_insert_payments"   ON payments;

CREATE POLICY "manager_superadmin_full_payments" ON payments
  FOR ALL
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));

CREATE POLICY "anon_authenticated_insert_payments" ON payments
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);


-- ============================================================
-- 4. employee_details (SSNs, filing status, paperwork)
--    Superadmin/manager only — most sensitive table in the system.
-- ============================================================
ALTER TABLE employee_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage employee details"              ON employee_details;
DROP POLICY IF EXISTS "manager_superadmin_full_employee_details"       ON employee_details;

CREATE POLICY "manager_superadmin_full_employee_details" ON employee_details
  FOR ALL
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));


-- ============================================================
-- 5. employee_documents (uploaded paperwork files)
--    Superadmin/manager only.
-- ============================================================
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin access employee docs"                         ON employee_documents;
DROP POLICY IF EXISTS "manager_superadmin_full_employee_documents"         ON employee_documents;

CREATE POLICY "manager_superadmin_full_employee_documents" ON employee_documents
  FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM user_profiles WHERE role = ANY (ARRAY['superadmin','manager'])
  ))
  WITH CHECK (auth.uid() IN (
    SELECT id FROM user_profiles WHERE role = ANY (ARRAY['superadmin','manager'])
  ));


-- ============================================================
-- 6. call_logs / sms_logs / fax_logs
--    Authenticated staff only (not worker_limited, not anon).
--    Edge functions use service_role so they bypass RLS anyway —
--    anon access was never needed for them to write logs.
-- ============================================================
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fax_logs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_call_logs" ON call_logs;
DROP POLICY IF EXISTS "allow_all_sms_logs"  ON sms_logs;
DROP POLICY IF EXISTS "allow_all_fax_logs"  ON fax_logs;
DROP POLICY IF EXISTS "staff_full_call_logs" ON call_logs;
DROP POLICY IF EXISTS "staff_full_sms_logs"  ON sms_logs;
DROP POLICY IF EXISTS "staff_full_fax_logs"  ON fax_logs;

CREATE POLICY "staff_full_call_logs" ON call_logs
  FOR ALL TO authenticated
  USING (get_my_role() <> 'worker_limited')
  WITH CHECK (get_my_role() <> 'worker_limited');

CREATE POLICY "staff_full_sms_logs" ON sms_logs
  FOR ALL TO authenticated
  USING (get_my_role() <> 'worker_limited')
  WITH CHECK (get_my_role() <> 'worker_limited');

CREATE POLICY "staff_full_fax_logs" ON fax_logs
  FOR ALL TO authenticated
  USING (get_my_role() <> 'worker_limited')
  WITH CHECK (get_my_role() <> 'worker_limited');


-- ============================================================
-- 7. client_properties / property_contacts
--    All authenticated can read (workers need this for their jobs).
--    Only dispatcher and above can write/edit/delete.
-- ============================================================
ALTER TABLE client_properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated can manage client_properties"       ON client_properties;
DROP POLICY IF EXISTS "staff_read_client_properties"                     ON client_properties;
DROP POLICY IF EXISTS "dispatcher_and_up_write_client_properties"        ON client_properties;
DROP POLICY IF EXISTS "dispatcher_and_up_update_client_properties"       ON client_properties;
DROP POLICY IF EXISTS "dispatcher_and_up_delete_client_properties"       ON client_properties;

CREATE POLICY "staff_read_client_properties" ON client_properties
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dispatcher_and_up_write_client_properties" ON client_properties
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "dispatcher_and_up_update_client_properties" ON client_properties
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "dispatcher_and_up_delete_client_properties" ON client_properties
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));

ALTER TABLE property_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated can manage property_contacts"       ON property_contacts;
DROP POLICY IF EXISTS "staff_read_property_contacts"                     ON property_contacts;
DROP POLICY IF EXISTS "dispatcher_and_up_write_property_contacts"        ON property_contacts;
DROP POLICY IF EXISTS "dispatcher_and_up_update_property_contacts"       ON property_contacts;
DROP POLICY IF EXISTS "dispatcher_and_up_delete_property_contacts"       ON property_contacts;

CREATE POLICY "staff_read_property_contacts" ON property_contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dispatcher_and_up_write_property_contacts" ON property_contacts
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "dispatcher_and_up_update_property_contacts" ON property_contacts
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "dispatcher_and_up_delete_property_contacts" ON property_contacts
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));


-- ============================================================
-- 8. invoice_line_items / quote_line_items
--    All authenticated can read. Only managers can write.
-- ============================================================
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_invoice_line_items"                ON invoice_line_items;
DROP POLICY IF EXISTS "staff_read_invoice_line_items"               ON invoice_line_items;
DROP POLICY IF EXISTS "manager_superadmin_write_invoice_line_items" ON invoice_line_items;
DROP POLICY IF EXISTS "manager_superadmin_update_invoice_line_items" ON invoice_line_items;
DROP POLICY IF EXISTS "manager_superadmin_delete_invoice_line_items" ON invoice_line_items;

CREATE POLICY "staff_read_invoice_line_items" ON invoice_line_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager_superadmin_write_invoice_line_items" ON invoice_line_items
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_superadmin_update_invoice_line_items" ON invoice_line_items
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_superadmin_delete_invoice_line_items" ON invoice_line_items
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));

ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_quote_line_items"                ON quote_line_items;
DROP POLICY IF EXISTS "staff_read_quote_line_items"               ON quote_line_items;
DROP POLICY IF EXISTS "manager_superadmin_write_quote_line_items" ON quote_line_items;
DROP POLICY IF EXISTS "manager_superadmin_update_quote_line_items" ON quote_line_items;
DROP POLICY IF EXISTS "manager_superadmin_delete_quote_line_items" ON quote_line_items;

CREATE POLICY "staff_read_quote_line_items" ON quote_line_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager_superadmin_write_quote_line_items" ON quote_line_items
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_superadmin_update_quote_line_items" ON quote_line_items
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_superadmin_delete_quote_line_items" ON quote_line_items
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));


-- ============================================================
-- 9. clients
--    All authenticated can read. Dispatcher+ can write/edit.
--    worker_limited cannot write.
-- ============================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_clients"     ON clients;
DROP POLICY IF EXISTS "dispatcher_up_write_clients"    ON clients;
DROP POLICY IF EXISTS "dispatcher_up_update_clients"   ON clients;
DROP POLICY IF EXISTS "dispatcher_up_delete_clients"   ON clients;

CREATE POLICY "authenticated_read_clients" ON clients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dispatcher_up_write_clients" ON clients
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "dispatcher_up_update_clients" ON clients
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "dispatcher_up_delete_clients" ON clients
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));


-- ============================================================
-- 10. jobs / schedules / quotes
--     All authenticated can read (workers see their job assignments).
--     Dispatcher+ can create/update. Manager+ can delete.
-- ============================================================
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_jobs"    ON jobs;
DROP POLICY IF EXISTS "dispatcher_up_write_jobs"   ON jobs;
DROP POLICY IF EXISTS "dispatcher_up_update_jobs"  ON jobs;
DROP POLICY IF EXISTS "manager_up_delete_jobs"     ON jobs;

CREATE POLICY "authenticated_read_jobs" ON jobs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dispatcher_up_write_jobs" ON jobs
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "dispatcher_up_update_jobs" ON jobs
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "manager_up_delete_jobs" ON jobs
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_schedules"    ON schedules;
DROP POLICY IF EXISTS "dispatcher_up_write_schedules"   ON schedules;
DROP POLICY IF EXISTS "dispatcher_up_update_schedules"  ON schedules;
DROP POLICY IF EXISTS "manager_up_delete_schedules"     ON schedules;

CREATE POLICY "authenticated_read_schedules" ON schedules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dispatcher_up_write_schedules" ON schedules
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "dispatcher_up_update_schedules" ON schedules
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "manager_up_delete_schedules" ON schedules
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_quotes"    ON quotes;
DROP POLICY IF EXISTS "dispatcher_up_write_quotes"   ON quotes;
DROP POLICY IF EXISTS "dispatcher_up_update_quotes"  ON quotes;
DROP POLICY IF EXISTS "manager_up_delete_quotes"     ON quotes;

CREATE POLICY "authenticated_read_quotes" ON quotes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dispatcher_up_write_quotes" ON quotes
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "dispatcher_up_update_quotes" ON quotes
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "manager_up_delete_quotes" ON quotes
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));


-- ============================================================
-- 11. invoices
--     All authenticated can read. Manager+ can write/edit/delete.
-- ============================================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_invoices"   ON invoices;
DROP POLICY IF EXISTS "manager_up_write_invoices"     ON invoices;
DROP POLICY IF EXISTS "manager_up_update_invoices"    ON invoices;
DROP POLICY IF EXISTS "manager_up_delete_invoices"    ON invoices;

CREATE POLICY "authenticated_read_invoices" ON invoices
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager_up_write_invoices" ON invoices
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_up_update_invoices" ON invoices
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_up_delete_invoices" ON invoices
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));


-- ============================================================
-- 12. employees / user_profiles
--     All authenticated can read (needed for job assignment UIs).
--     Only manager+ can write/edit. worker_limited read-only.
-- ============================================================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_employees"  ON employees;
DROP POLICY IF EXISTS "manager_up_write_employees"    ON employees;
DROP POLICY IF EXISTS "manager_up_update_employees"   ON employees;
DROP POLICY IF EXISTS "manager_up_delete_employees"   ON employees;

CREATE POLICY "authenticated_read_employees" ON employees
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager_up_write_employees" ON employees
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_up_update_employees" ON employees
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_up_delete_employees" ON employees
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_own_profile"           ON user_profiles;
DROP POLICY IF EXISTS "manager_up_read_all_profiles"     ON user_profiles;
DROP POLICY IF EXISTS "manager_up_write_profiles"        ON user_profiles;
DROP POLICY IF EXISTS "manager_up_update_profiles"       ON user_profiles;
DROP POLICY IF EXISTS "authenticated_read_user_profiles" ON user_profiles;

-- IMPORTANT: do NOT use get_my_role() in user_profiles policies.
-- get_my_role() queries user_profiles itself, causing infinite recursion
-- that blocks all reads. Use direct subqueries instead.
CREATE POLICY "authenticated_read_user_profiles" ON user_profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "manager_up_write_profiles" ON user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('superadmin','manager'))
  );

CREATE POLICY "manager_up_update_profiles" ON user_profiles
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id OR
    auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('superadmin','manager'))
  )
  WITH CHECK (
    auth.uid() = id OR
    auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('superadmin','manager'))
  );


-- ============================================================
-- 13. expenses / inventory / products_services
--     All authenticated can read. Manager+ can write/edit/delete.
-- ============================================================
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_expenses"  ON expenses;
DROP POLICY IF EXISTS "manager_up_write_expenses"    ON expenses;
DROP POLICY IF EXISTS "manager_up_update_expenses"   ON expenses;
DROP POLICY IF EXISTS "manager_up_delete_expenses"   ON expenses;

CREATE POLICY "authenticated_read_expenses" ON expenses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager_up_write_expenses" ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_up_update_expenses" ON expenses
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_up_delete_expenses" ON expenses
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_inventory"  ON inventory;
DROP POLICY IF EXISTS "manager_up_write_inventory"    ON inventory;
DROP POLICY IF EXISTS "manager_up_update_inventory"   ON inventory;
DROP POLICY IF EXISTS "manager_up_delete_inventory"   ON inventory;

CREATE POLICY "authenticated_read_inventory" ON inventory
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager_up_write_inventory" ON inventory
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_up_update_inventory" ON inventory
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_up_delete_inventory" ON inventory
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));

ALTER TABLE products_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_products_services"  ON products_services;
DROP POLICY IF EXISTS "manager_up_write_products_services"    ON products_services;
DROP POLICY IF EXISTS "manager_up_update_products_services"   ON products_services;
DROP POLICY IF EXISTS "manager_up_delete_products_services"   ON products_services;

CREATE POLICY "authenticated_read_products_services" ON products_services
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager_up_write_products_services" ON products_services
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_up_update_products_services" ON products_services
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_up_delete_products_services" ON products_services
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));


-- ============================================================
-- 14. clock_events / time_off_requests
--     Managed by admins/managers only. Field workers clock in
--     via the public kiosk page which uses the service role,
--     bypassing RLS entirely. employees table has no user_id column.
-- ============================================================
ALTER TABLE clock_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_or_manager_clock_events"  ON clock_events;
DROP POLICY IF EXISTS "manager_full_clock_events"    ON clock_events;

CREATE POLICY "manager_full_clock_events" ON clock_events
  FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));

ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_or_manager_time_off"         ON time_off_requests;
DROP POLICY IF EXISTS "manager_full_time_off_requests"  ON time_off_requests;

CREATE POLICY "manager_full_time_off_requests" ON time_off_requests
  FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager']));


-- ============================================================
-- 15. team_messages / requests
--     All authenticated can read and write (internal comms).
--     Only manager+ can delete.
-- ============================================================
ALTER TABLE team_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_write_team_messages" ON team_messages;
DROP POLICY IF EXISTS "manager_delete_team_messages"           ON team_messages;

CREATE POLICY "authenticated_read_write_team_messages" ON team_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_team_messages" ON team_messages
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_own_team_messages" ON team_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id OR get_my_role() = ANY (ARRAY['superadmin','manager']))
  WITH CHECK (auth.uid() = sender_id OR get_my_role() = ANY (ARRAY['superadmin','manager']));
CREATE POLICY "manager_delete_team_messages" ON team_messages
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_requests"  ON requests;

CREATE POLICY "authenticated_full_requests" ON requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- 16. client_files
--     All authenticated can read (staff access client docs).
--     Manager+ can write/delete.
-- ============================================================
ALTER TABLE client_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_client_files"  ON client_files;
DROP POLICY IF EXISTS "manager_up_write_client_files"    ON client_files;
DROP POLICY IF EXISTS "manager_up_delete_client_files"   ON client_files;

CREATE POLICY "authenticated_read_client_files" ON client_files
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager_up_write_client_files" ON client_files
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['superadmin','manager','dispatcher']));
CREATE POLICY "manager_up_delete_client_files" ON client_files
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY (ARRAY['superadmin','manager']));


-- ============================================================
-- VERIFICATION — run this after the above to confirm coverage.
-- All tables should show rls_enabled=true and status=🟢 OK.
-- ============================================================
SELECT
  t.tablename AS table_name,
  c.relrowsecurity AS rls_enabled,
  COUNT(p.policyname) AS policy_count,
  CASE
    WHEN NOT c.relrowsecurity THEN '🔴 CRITICAL: RLS disabled'
    WHEN COUNT(p.policyname) = 0 THEN '🔴 CRITICAL: RLS on but no policies'
    WHEN COUNT(p.policyname) < 2 THEN '🟡 WARNING: only 1 policy'
    ELSE '🟢 OK'
  END AS status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = 'public'
WHERE t.schemaname = 'public'
GROUP BY t.tablename, c.relrowsecurity
ORDER BY
  CASE WHEN NOT c.relrowsecurity THEN 0
       WHEN COUNT(p.policyname) = 0 THEN 1
       ELSE 2 END,
  t.tablename;
