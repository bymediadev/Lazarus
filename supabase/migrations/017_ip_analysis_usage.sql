-- Hashed IP freemium counters (30-day windows). Service role only.

CREATE TABLE IF NOT EXISTS public.ip_analysis_usage (
  ip_hash text NOT NULL,
  kind text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  window_end timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (ip_hash, kind)
);

ALTER TABLE public.ip_analysis_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_analysis_usage FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ip_analysis_usage FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.ip_analysis_usage TO postgres, service_role;

DROP POLICY IF EXISTS deny_anon_ip_usage ON public.ip_analysis_usage;
DROP POLICY IF EXISTS deny_authenticated_ip_usage ON public.ip_analysis_usage;
CREATE POLICY deny_anon_ip_usage ON public.ip_analysis_usage
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY deny_authenticated_ip_usage ON public.ip_analysis_usage
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.ip_analysis_usage IS
  'Hashed IP analysis counters for guest/unpaid caps. RLS deny-all; service role only.';
