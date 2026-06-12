-- Enterprise RLS hardening — tenant isolation on all post-mortem data
-- Run in Supabase SQL Editor after setup.sql

ALTER TABLE call_post_mortems ENABLE ROW LEVEL SECURITY;

-- Drop legacy policies
DROP POLICY IF EXISTS "Users can create their own post-mortems" ON call_post_mortems;
DROP POLICY IF EXISTS "Users can view their own post-mortems" ON call_post_mortems;
DROP POLICY IF EXISTS "Users can update their own post-mortems" ON call_post_mortems;
DROP POLICY IF EXISTS "Users can delete their own post-mortems" ON call_post_mortems;
DROP POLICY IF EXISTS "Deny anonymous client access" ON call_post_mortems;

-- Authenticated users: full CRUD on own rows only
CREATE POLICY "tenant_select_own"
  ON call_post_mortems FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tenant_insert_own"
  ON call_post_mortems FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_update_own"
  ON call_post_mortems FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_delete_own"
  ON call_post_mortems FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Block anon key from reading/writing tenant data (service role bypasses RLS for API server)
CREATE POLICY "deny_anon_all"
  ON call_post_mortems FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Optional: audit index for retention purge jobs
CREATE INDEX IF NOT EXISTS idx_call_post_mortems_created_at
  ON call_post_mortems (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_post_mortems_user_id
  ON call_post_mortems (user_id);

COMMENT ON TABLE call_post_mortems IS
  'Deal autopsy records. RLS enforced — tenants see only auth.uid() = user_id rows. Service role for server API.';

-- INFRASTRUCTURE CHECKLIST (configure in Supabase Dashboard, not SQL):
-- 1. Project region: EU (Frankfurt/Ireland) for GDPR customers
-- 2. Database → Backups: enable Point-in-Time Recovery (PITR)
-- 3. Vault / pgsodium: encrypt CRM API keys at rest (see docs/ENTERPRISE_SECURITY.md)
-- 4. Scheduled Edge Function: purge transcript_text older than DATA_RETENTION_DAYS
