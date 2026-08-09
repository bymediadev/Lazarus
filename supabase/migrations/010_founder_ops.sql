-- Founder / ops command center: telemetry, audit, alert cooldown, account notes

CREATE TABLE IF NOT EXISTS api_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  request_id TEXT NOT NULL,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER,
  user_id UUID,
  error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_events_created_at ON api_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_events_status_created ON api_events (status_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_events_user_id ON api_events (user_id);

ALTER TABLE api_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_api_events" ON api_events;
DROP POLICY IF EXISTS "deny_authenticated_api_events" ON api_events;
CREATE POLICY "deny_anon_api_events" ON api_events FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated_api_events" ON api_events FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS founder_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  actor_user_id UUID,
  action TEXT NOT NULL,
  target_user_id UUID,
  target_deal_id UUID,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_founder_audit_created ON founder_audit_log (created_at DESC);

ALTER TABLE founder_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_founder_audit" ON founder_audit_log;
DROP POLICY IF EXISTS "deny_authenticated_founder_audit" ON founder_audit_log;
CREATE POLICY "deny_anon_founder_audit" ON founder_audit_log FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated_founder_audit" ON founder_audit_log FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS founder_alert_state (
  issue_key TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  last_resolved_at TIMESTAMPTZ,
  meta JSONB
);

ALTER TABLE founder_alert_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_founder_alert_state" ON founder_alert_state;
DROP POLICY IF EXISTS "deny_authenticated_founder_alert_state" ON founder_alert_state;
CREATE POLICY "deny_anon_founder_alert_state" ON founder_alert_state FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated_founder_alert_state" ON founder_alert_state FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS founder_account_notes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_by UUID
);

ALTER TABLE founder_account_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_founder_notes" ON founder_account_notes;
DROP POLICY IF EXISTS "deny_authenticated_founder_notes" ON founder_account_notes;
CREATE POLICY "deny_anon_founder_notes" ON founder_account_notes FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated_founder_notes" ON founder_account_notes FOR ALL TO authenticated USING (false) WITH CHECK (false);
