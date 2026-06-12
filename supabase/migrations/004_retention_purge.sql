-- Retention purge helper (optional — run via npm run purge:retention or API cron)
-- Nulls transcript_text on records older than retention_days; preserves analysis_json.

CREATE OR REPLACE FUNCTION purge_expired_transcripts(retention_days INT DEFAULT 30)
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
  SET transcript_text = NULL
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
    AND transcript_text IS NOT NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION purge_expired_transcripts(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_expired_transcripts(INT) FROM anon;
REVOKE ALL ON FUNCTION purge_expired_transcripts(INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_transcripts(INT) TO service_role;

COMMENT ON FUNCTION purge_expired_transcripts IS
  'Nulls transcript_text older than retention_days. Call from cron: SELECT purge_expired_transcripts(30);';
