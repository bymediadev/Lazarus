-- Company API keys and a one-time wipe of stored evidence.
-- The migration runner wraps this file. Do not add BEGIN/COMMIT.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_key_hash TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_key_prefix TEXT;

ALTER TABLE call_post_mortems ADD COLUMN IF NOT EXISTS source_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_api_key_hash
  ON tenants (api_key_hash)
  WHERE api_key_hash IS NOT NULL;

-- Drop evidence quotes, transcripts, and CRM blocks. Leave scores and rescue plans.
CREATE OR REPLACE FUNCTION public.strip_report_evidence(doc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  key text;
  val jsonb;
  result jsonb := '{}'::jsonb;
  elem jsonb;
  arr jsonb := '[]'::jsonb;
  inner_text text;
BEGIN
  IF doc IS NULL THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(doc) = 'string' THEN
    inner_text := doc #>> '{}';
    BEGIN
      RETURN public.strip_report_evidence(inner_text::jsonb);
    EXCEPTION WHEN others THEN
      RETURN doc;
    END;
  END IF;

  IF jsonb_typeof(doc) = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(doc)
    LOOP
      arr := arr || jsonb_build_array(public.strip_report_evidence(elem));
    END LOOP;
    RETURN arr;
  END IF;

  IF jsonb_typeof(doc) <> 'object' THEN
    RETURN doc;
  END IF;

  FOR key, val IN SELECT * FROM jsonb_each(doc)
  LOOP
    IF key IN (
      'evidence',
      'transcript',
      'transcript_text',
      'historical_context_match',
      'historical_crm_context',
      'grounding_audit',
      'quotes',
      'quote'
    ) THEN
      CONTINUE;
    END IF;
    result := result || jsonb_build_object(key, public.strip_report_evidence(val));
  END LOOP;
  RETURN result;
END;
$$;

UPDATE call_post_mortems
SET transcript_text = NULL;

UPDATE call_post_mortems
SET analysis_json = public.strip_report_evidence(analysis_json)
WHERE analysis_json IS NOT NULL;

REVOKE ALL ON FUNCTION public.strip_report_evidence(jsonb) FROM PUBLIC, anon, authenticated;
