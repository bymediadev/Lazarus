-- P2: Stateful persistence — ingest metadata + redacted deal memory summary
ALTER TABLE call_post_mortems
  ADD COLUMN IF NOT EXISTS ingest_metadata JSONB,
  ADD COLUMN IF NOT EXISTS deal_memory_summary JSONB;
