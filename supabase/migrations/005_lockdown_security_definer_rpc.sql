-- Fix Supabase linter 0028/0029: SECURITY DEFINER functions must not be RPC-callable
-- from anon/authenticated (browser keys). Server/cron uses service_role or postgres.

REVOKE ALL ON FUNCTION public.purge_expired_transcripts(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_transcripts(integer) FROM anon;
REVOKE ALL ON FUNCTION public.purge_expired_transcripts(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_transcripts(integer) TO service_role;

-- Supabase platform helper (if present on project) — not a public API
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon;
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated;
  END IF;
END;
$$;
