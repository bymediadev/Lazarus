-- Security sweep: identity binding, tenant-scoped CRM links, OAuth token store,
-- atomic IP caps, retention cleanup, append-only ops audit, RLS on the purge log.
-- The migration runner wraps this file. Do not add BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS public.user_identities (
  provider text NOT NULL,
  provider_sub text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (provider, provider_sub)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON public.user_identities (user_id);

ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_identities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_identities FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.user_identities TO postgres, service_role;

DROP POLICY IF EXISTS deny_anon_user_identities ON public.user_identities;
DROP POLICY IF EXISTS deny_authenticated_user_identities ON public.user_identities;
CREATE POLICY deny_anon_user_identities ON public.user_identities
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY deny_authenticated_user_identities ON public.user_identities
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.oauth_connections (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'zoom', 'hubspot', 'salesforce', 'teams')),
  token_blob text NOT NULL,
  portal_id text,
  account_email text,
  webhook_secret_hash text,
  connected_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_connections_webhook
  ON public.oauth_connections (provider, webhook_secret_hash)
  WHERE webhook_secret_hash IS NOT NULL;

ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_connections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.oauth_connections FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.oauth_connections TO postgres, service_role;

DROP POLICY IF EXISTS deny_anon_oauth_connections ON public.oauth_connections;
DROP POLICY IF EXISTS deny_authenticated_oauth_connections ON public.oauth_connections;
CREATE POLICY deny_anon_oauth_connections ON public.oauth_connections
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY deny_authenticated_oauth_connections ON public.oauth_connections
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.live_meeting_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  meeting_id text,
  acknowledged_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.live_meeting_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_meeting_consent FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.live_meeting_consent FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.live_meeting_consent TO postgres, service_role;

DROP POLICY IF EXISTS deny_anon_live_meeting_consent ON public.live_meeting_consent;
DROP POLICY IF EXISTS deny_authenticated_live_meeting_consent ON public.live_meeting_consent;
CREATE POLICY deny_anon_live_meeting_consent ON public.live_meeting_consent
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY deny_authenticated_live_meeting_consent ON public.live_meeting_consent
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE public.crm_deal_links
  ADD COLUMN IF NOT EXISTS portal_id text NOT NULL DEFAULT '';

ALTER TABLE public.crm_deal_links
  DROP CONSTRAINT IF EXISTS crm_deal_links_provider_external_deal_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS crm_deal_links_provider_portal_deal
  ON public.crm_deal_links (provider, portal_id, external_deal_id);

-- Customer reads go through the user JWT. Service role stays for webhooks and ops.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_post_mortems TO authenticated;
GRANT SELECT, INSERT ON public.rescue_outcomes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deal_links TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_ip_usage(
  p_ip_hash text,
  p_kind text,
  p_window_end timestamptz,
  p_max integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.ip_analysis_usage%ROWTYPE;
BEGIN
  IF p_max < 1 THEN
    RETURN true;
  END IF;

  INSERT INTO public.ip_analysis_usage (ip_hash, kind, count, window_end, updated_at)
  VALUES (p_ip_hash, p_kind, 0, p_window_end, timezone('utc'::text, now()))
  ON CONFLICT (ip_hash, kind) DO NOTHING;

  SELECT * INTO row
  FROM public.ip_analysis_usage
  WHERE ip_hash = p_ip_hash AND kind = p_kind
  FOR UPDATE;

  IF row.window_end <= timezone('utc'::text, now()) THEN
    UPDATE public.ip_analysis_usage
    SET count = 1,
        window_end = p_window_end,
        updated_at = timezone('utc'::text, now())
    WHERE ip_hash = p_ip_hash AND kind = p_kind;
    RETURN false;
  END IF;

  IF row.count >= p_max THEN
    RETURN true;
  END IF;

  UPDATE public.ip_analysis_usage
  SET count = count + 1,
      updated_at = timezone('utc'::text, now())
  WHERE ip_hash = p_ip_hash AND kind = p_kind;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ip_usage(text, text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ip_usage(text, text, timestamptz, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_transcripts(retention_days INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INT;
BEGIN
  IF retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days must be >= 1';
  END IF;

  UPDATE call_post_mortems
  SET transcript_text = NULL,
      why_it_stalled = NULL,
      restart_plan = NULL,
      stall_cause = NULL,
      analysis_json = public.strip_report_evidence(analysis_json),
      deal_memory_summary = public.strip_report_evidence(deal_memory_summary)
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
    AND (
      transcript_text IS NOT NULL
      OR why_it_stalled IS NOT NULL
      OR restart_plan IS NOT NULL
      OR stall_cause IS NOT NULL
      OR analysis_json IS NOT NULL
      OR deal_memory_summary IS NOT NULL
    );

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_transcripts(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_transcripts(INT) TO service_role;

ALTER TABLE public.purge_audit_log ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE public.purge_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purge_audit_log FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purge_audit_log FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.purge_audit_log TO postgres, service_role;

REVOKE UPDATE, DELETE ON TABLE public.founder_audit_log FROM anon, authenticated, PUBLIC, service_role;
GRANT INSERT, SELECT ON TABLE public.founder_audit_log TO service_role;
