-- ============================================================
-- PHL CRM — RLS Security Audit
-- Run this in Supabase SQL Editor > New Query
-- Review every result and act on any WARNING or CRITICAL flag
-- ============================================================


-- ============================================================
-- AUDIT 1: Tables with NO RLS enabled (CRITICAL)
-- Any table listed here is fully exposed to all authenticated users
-- ============================================================
SELECT
  'CRITICAL' AS severity,
  'RLS_DISABLED' AS check_type,
  tablename AS table_name,
  'RLS is not enabled on this table — all rows are readable by any authenticated user' AS message
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_policies WHERE schemaname = 'public'
  )
ORDER BY tablename;


-- ============================================================
-- AUDIT 2: Tables with RLS enabled but ZERO policies (CRITICAL)
-- RLS on + no policies = nobody can read anything (lockout risk)
-- ============================================================
SELECT
  'CRITICAL' AS severity,
  'RLS_ENABLED_NO_POLICIES' AS check_type,
  c.relname AS table_name,
  'RLS is ON but no policies exist — all queries will return 0 rows' AS message
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND c.relname NOT IN (
    SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public'
  )
ORDER BY c.relname;


-- ============================================================
-- AUDIT 3: Policies using USING (true) — open access (WARNING)
-- These tables are readable by any authenticated user regardless of org
-- ============================================================
SELECT
  'WARNING' AS severity,
  'OPEN_ACCESS_POLICY' AS check_type,
  tablename AS table_name,
  policyname AS policy_name,
  'Policy uses USING (true) — any authenticated user can read all rows' AS message
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = 'true'
ORDER BY tablename, policyname;


-- ============================================================
-- AUDIT 4: Tables missing org_id column (WARNING)
-- All tenant-scoped tables must have org_id for multi-tenancy
-- ============================================================
SELECT
  'WARNING' AS severity,
  'MISSING_ORG_ID' AS check_type,
  t.tablename AS table_name,
  'Table exists in public schema but has no org_id column — verify if intentional' AS message
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.tablename NOT IN ('schema_migrations', 'sequences')
  AND t.tablename NOT IN (
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'org_id'
  )
ORDER BY t.tablename;


-- ============================================================
-- AUDIT 5: Tables missing soft delete column (WARNING)
-- All customer-facing tables should use deleted_at not hard DELETE
-- ============================================================
SELECT
  'WARNING' AS severity,
  'MISSING_SOFT_DELETE' AS check_type,
  t.tablename AS table_name,
  'No deleted_at column found — hard deletes risk data loss' AS message
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'customers', 'jobs', 'estimates', 'invoices',
    'service_locations', 'products', 'user_profiles'
  )
  AND t.tablename NOT IN (
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'deleted_at'
  )
ORDER BY t.tablename;


-- ============================================================
-- AUDIT 6: Policies that do NOT reference deleted_at (WARNING)
-- Soft-deleted rows should never be visible through RLS
-- ============================================================
SELECT
  'WARNING' AS severity,
  'POLICY_MISSING_SOFT_DELETE_CHECK' AS check_type,
  p.tablename AS table_name,
  p.policyname AS policy_name,
  'Policy does not check deleted_at IS NULL — soft-deleted rows may be visible' AS message
FROM pg_policies p
JOIN information_schema.columns c
  ON c.table_schema = 'public'
  AND c.table_name = p.tablename
  AND c.column_name = 'deleted_at'
WHERE p.schemaname = 'public'
  AND p.qual NOT LIKE '%deleted_at%'
ORDER BY p.tablename, p.policyname;


-- ============================================================
-- AUDIT 7: anon role granted direct table access (CRITICAL)
-- anon should only reach tables via RLS + explicit policies
-- ============================================================
SELECT
  'CRITICAL' AS severity,
  'ANON_ROLE_TABLE_ACCESS' AS check_type,
  table_name,
  privilege_type,
  'anon role has direct ' || privilege_type || ' access — verify this is intentional' AS message
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;


-- ============================================================
-- AUDIT 8: service_role access summary (INFO)
-- service_role bypasses RLS — confirm it's only used server-side
-- ============================================================
SELECT
  'INFO' AS severity,
  'SERVICE_ROLE_ACCESS' AS check_type,
  table_name,
  privilege_type,
  'service_role has ' || privilege_type || ' access (bypasses RLS) — must NEVER be used in frontend' AS message
FROM information_schema.role_table_grants
WHERE grantee = 'service_role'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;


-- ============================================================
-- AUDIT 9: Full policy inventory (INFO)
-- Review all policies in one place — look for anything unexpected
-- ============================================================
SELECT
  'INFO' AS severity,
  'POLICY_INVENTORY' AS check_type,
  tablename AS table_name,
  policyname AS policy_name,
  cmd AS command,
  roles,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- ============================================================
-- AUDIT 10: Tables missing updated_at trigger (WARNING)
-- All tables should auto-update updated_at on every write
-- ============================================================
SELECT
  'WARNING' AS severity,
  'MISSING_UPDATED_AT_TRIGGER' AS check_type,
  t.tablename AS table_name,
  'No set_updated_at trigger found — updated_at will not auto-update' AS message
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.tablename NOT IN (
    SELECT event_object_table
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name LIKE '%updated_at%'
  )
  AND t.tablename IN (
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updated_at'
  )
ORDER BY t.tablename;


-- ============================================================
-- AUDIT 11: RLS policy coverage per table (SUMMARY)
-- ============================================================
SELECT
  t.tablename AS table_name,
  c.relrowsecurity AS rls_enabled,
  COUNT(p.policyname) AS policy_count,
  STRING_AGG(p.policyname, ', ' ORDER BY p.policyname) AS policies,
  CASE
    WHEN NOT c.relrowsecurity THEN '🔴 CRITICAL: RLS disabled'
    WHEN COUNT(p.policyname) = 0 THEN '🔴 CRITICAL: RLS on but no policies'
    WHEN COUNT(p.policyname) < 2 THEN '🟡 WARNING: Only 1 policy — verify SELECT + INSERT/UPDATE covered'
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
       ELSE 2
  END,
  t.tablename;
