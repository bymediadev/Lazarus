-- Kill switch, client crash reports (Sentry substitute), restore-drill snapshots.

CREATE TABLE IF NOT EXISTS app_runtime_config (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  analyses_paused BOOLEAN NOT NULL DEFAULT false,
  pause_message TEXT NOT NULL DEFAULT 'Analyses are paused. Try again shortly.',
  daily_analysis_cap INTEGER CHECK (daily_analysis_cap IS NULL OR daily_analysis_cap > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_by UUID
);

INSERT INTO app_runtime_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_runtime_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_runtime" ON app_runtime_config;
DROP POLICY IF EXISTS "deny_authenticated_runtime" ON app_runtime_config;
CREATE POLICY "deny_anon_runtime"
  ON app_runtime_config FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated_runtime"
  ON app_runtime_config FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE app_runtime_config IS
  'Singleton ops runtime: analysis kill switch and optional global daily analysis cap. Service role only.';

CREATE TABLE IF NOT EXISTS client_crashes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  message TEXT NOT NULL,
  stack TEXT,
  page_url TEXT,
  user_agent TEXT,
  release_sha TEXT,
  user_id UUID
);

CREATE INDEX IF NOT EXISTS idx_client_crashes_created_at ON client_crashes (created_at DESC);

ALTER TABLE client_crashes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_client_crashes" ON client_crashes;
DROP POLICY IF EXISTS "deny_authenticated_client_crashes" ON client_crashes;
CREATE POLICY "deny_anon_client_crashes"
  ON client_crashes FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated_client_crashes"
  ON client_crashes FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE client_crashes IS
  'Browser crash / unhandled error reports. Inserts via service role from /api/telemetry/crash.';

CREATE TABLE IF NOT EXISTS ops_restore_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  actor_user_id UUID,
  counts JSONB NOT NULL,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_ops_restore_snapshots_created
  ON ops_restore_snapshots (created_at DESC);

ALTER TABLE ops_restore_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_restore_snapshots" ON ops_restore_snapshots;
DROP POLICY IF EXISTS "deny_authenticated_restore_snapshots" ON ops_restore_snapshots;
CREATE POLICY "deny_anon_restore_snapshots"
  ON ops_restore_snapshots FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated_restore_snapshots"
  ON ops_restore_snapshots FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE ops_restore_snapshots IS
  'Point-in-time row counts for a restore drill. Compare after restoring a Supabase backup.';
