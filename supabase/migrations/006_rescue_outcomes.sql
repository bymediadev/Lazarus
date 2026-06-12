-- Rescue loop feedback: anonymous metadata only (transcript-safe flywheel)
-- Survives 30-day transcript purge; no raw dialogue stored here.
CREATE TABLE IF NOT EXISTS rescue_outcomes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_mortem_id UUID REFERENCES call_post_mortems(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_risk_index SMALLINT,
  viability_score SMALLINT,
  trajectory_type TEXT,
  constraint_band TEXT CHECK (constraint_band IN ('low', 'medium', 'high')),
  stakeholder_dispersion SMALLINT,
  persona_signature TEXT,
  rescue_action_taken TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('closed_won', 'still_stalled', 'lost', 'unknown')),
  outcome_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE rescue_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_own_outcomes" ON rescue_outcomes;
DROP POLICY IF EXISTS "tenant_insert_own_outcomes" ON rescue_outcomes;
DROP POLICY IF EXISTS "deny_anon_outcomes" ON rescue_outcomes;

CREATE POLICY "tenant_select_own_outcomes"
  ON rescue_outcomes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tenant_insert_own_outcomes"
  ON rescue_outcomes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "deny_anon_outcomes"
  ON rescue_outcomes FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_rescue_outcomes_post_mortem ON rescue_outcomes (post_mortem_id);
CREATE INDEX IF NOT EXISTS idx_rescue_outcomes_outcome ON rescue_outcomes (outcome, outcome_at DESC);

COMMENT ON TABLE rescue_outcomes IS
  'Anonymous rescue success vectors for flywheel training. No transcript text; metadata only.';