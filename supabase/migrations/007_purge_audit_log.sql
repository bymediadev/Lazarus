-- Audit trail for scheduled transcript retention purges

CREATE TABLE IF NOT EXISTS purge_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rows_affected INTEGER NOT NULL DEFAULT 0,
  retention_days INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purge_audit_log_purged_at ON purge_audit_log (purged_at DESC);

COMMENT ON TABLE purge_audit_log IS
  'Records each retention purge run (rows nulled, retention window applied).';
