-- Google OAuth tokens for Meet/Gmail Connect. Service-role only (survives Render restarts).

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  id TEXT PRIMARY KEY DEFAULT 'default',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  account_email TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_google_oauth_tokens" ON google_oauth_tokens;
DROP POLICY IF EXISTS "deny_authenticated_google_oauth_tokens" ON google_oauth_tokens;
CREATE POLICY "deny_anon_google_oauth_tokens" ON google_oauth_tokens FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated_google_oauth_tokens" ON google_oauth_tokens FOR ALL TO authenticated USING (false) WITH CHECK (false);
