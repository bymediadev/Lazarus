-- Lazarus — FULL SETUP (run this first in Supabase SQL Editor)
-- For existing projects, prefer migrations/003 through 006 instead of re-running this file.
CREATE TABLE IF NOT EXISTS call_post_mortems (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    client_name TEXT DEFAULT 'Unknown Deal',
    deal_value NUMERIC DEFAULT 0,
    deal_status TEXT NOT NULL DEFAULT 'STALLED — RECOVERABLE',
    stall_cause TEXT NOT NULL,
    why_it_stalled TEXT NOT NULL,
    restart_plan TEXT NOT NULL,
    transcript_text TEXT,
    analysis_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE call_post_mortems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own post-mortems" ON call_post_mortems;
DROP POLICY IF EXISTS "Users can view their own post-mortems" ON call_post_mortems;
DROP POLICY IF EXISTS "tenant_select_own" ON call_post_mortems;
DROP POLICY IF EXISTS "tenant_insert_own" ON call_post_mortems;
DROP POLICY IF EXISTS "tenant_update_own" ON call_post_mortems;
DROP POLICY IF EXISTS "tenant_delete_own" ON call_post_mortems;
DROP POLICY IF EXISTS "deny_anon_all" ON call_post_mortems;

CREATE POLICY "tenant_select_own"
  ON call_post_mortems FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tenant_insert_own"
  ON call_post_mortems FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_update_own"
  ON call_post_mortems FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_delete_own"
  ON call_post_mortems FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "deny_anon_all"
  ON call_post_mortems FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_call_post_mortems_created_at ON call_post_mortems (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_post_mortems_user_id ON call_post_mortems (user_id);

-- Server API saves use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS — never expose to browser)
