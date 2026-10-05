-- Delete a saved report 30 days after the deal is won or a flat no.
-- Open and recoverable deals leave purge_after null. The migration runner wraps this file.

ALTER TABLE call_post_mortems ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_call_post_mortems_purge_after
  ON call_post_mortems (purge_after)
  WHERE purge_after IS NOT NULL;
