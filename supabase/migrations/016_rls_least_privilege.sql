-- Harden public-schema access for launch.
-- Browser uses the anon key for Auth only (src/lib/auth.ts). All table I/O is
-- Express + service_role. Postgres TRUNCATE is not subject to RLS, so the
-- default GRANT ALL to anon/authenticated was a wipe path even with policies.

-- 1) Least privilege: Data API cannot touch public tables.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC;

-- 2) FORCE RLS so a non-BYPASSRLS table owner cannot skip policies.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- 3) Tenant policies: (select auth.uid()) once per query; authenticated only.
DROP POLICY IF EXISTS "tenant_select_own" ON call_post_mortems;
DROP POLICY IF EXISTS "tenant_insert_own" ON call_post_mortems;
DROP POLICY IF EXISTS "tenant_update_own" ON call_post_mortems;
DROP POLICY IF EXISTS "tenant_delete_own" ON call_post_mortems;
DROP POLICY IF EXISTS "deny_anon_all" ON call_post_mortems;

CREATE POLICY "tenant_select_own"
  ON call_post_mortems FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "tenant_insert_own"
  ON call_post_mortems FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "tenant_update_own"
  ON call_post_mortems FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "tenant_delete_own"
  ON call_post_mortems FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "deny_anon_all"
  ON call_post_mortems FOR ALL TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "tenant_select_own_outcomes" ON rescue_outcomes;
DROP POLICY IF EXISTS "tenant_insert_own_outcomes" ON rescue_outcomes;
DROP POLICY IF EXISTS "deny_anon_outcomes" ON rescue_outcomes;

CREATE POLICY "tenant_select_own_outcomes"
  ON rescue_outcomes FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "tenant_insert_own_outcomes"
  ON rescue_outcomes FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "deny_anon_outcomes"
  ON rescue_outcomes FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_rescue_outcomes_user_id ON rescue_outcomes (user_id);

DROP POLICY IF EXISTS crm_deal_links_select_own ON crm_deal_links;
DROP POLICY IF EXISTS crm_deal_links_insert_own ON crm_deal_links;
DROP POLICY IF EXISTS crm_deal_links_update_own ON crm_deal_links;
DROP POLICY IF EXISTS crm_deal_links_delete_own ON crm_deal_links;
DROP POLICY IF EXISTS deny_anon_crm_deal_links ON crm_deal_links;

CREATE POLICY crm_deal_links_select_own ON crm_deal_links
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY crm_deal_links_insert_own ON crm_deal_links
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY crm_deal_links_update_own ON crm_deal_links
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY crm_deal_links_delete_own ON crm_deal_links
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY deny_anon_crm_deal_links ON crm_deal_links
  FOR ALL TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "billing_select_own" ON billing_customers;
DROP POLICY IF EXISTS "deny_anon_billing" ON billing_customers;

CREATE POLICY "billing_select_own"
  ON billing_customers FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "deny_anon_billing"
  ON billing_customers FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- 4) Service-role-only tables: explicit deny-all (linter 0008).
-- These already exist on production (migration rls_least_privilege, 2026-09-01).
DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT *
    FROM (
      VALUES
        ('api_events', 'deny_anon_api_events', 'deny_authenticated_api_events'),
        ('app_runtime_config', 'deny_anon_runtime', 'deny_authenticated_runtime'),
        ('client_crashes', 'deny_anon_client_crashes', 'deny_authenticated_client_crashes'),
        ('contact_inquiries', 'deny_anon_contact_inquiries', 'deny_authenticated_contact_inquiries'),
        ('founder_account_notes', 'deny_anon_founder_notes', 'deny_authenticated_founder_notes'),
        ('founder_alert_state', 'deny_anon_founder_alert_state', 'deny_authenticated_founder_alert_state'),
        ('founder_audit_log', 'deny_anon_founder_audit', 'deny_authenticated_founder_audit'),
        ('google_oauth_tokens', 'deny_anon_google_oauth_tokens', 'deny_authenticated_google_oauth_tokens'),
        ('ops_restore_snapshots', 'deny_anon_restore_snapshots', 'deny_authenticated_restore_snapshots'),
        ('purge_audit_log', 'deny_anon_purge_audit', 'deny_authenticated_purge_audit')
    ) AS t(tbl, anon_pol, auth_pol)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', spec.anon_pol, spec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', spec.auth_pol, spec.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon USING (false) WITH CHECK (false)',
      spec.anon_pol,
      spec.tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
      spec.auth_pol,
      spec.tbl
    );
  END LOOP;
END $$;

COMMENT ON TABLE purge_audit_log IS
  'Retention purge runs. RLS deny-all for anon/authenticated; service role only.';
COMMENT ON TABLE app_runtime_config IS
  'Singleton ops runtime: analysis kill switch and optional global daily analysis cap. Service role only.';
COMMENT ON TABLE client_crashes IS
  'Browser crash / unhandled error reports. Inserts via service role from /api/telemetry/crash.';
COMMENT ON TABLE ops_restore_snapshots IS
  'Point-in-time row counts for a restore drill. Compare after restoring a Supabase backup.';
