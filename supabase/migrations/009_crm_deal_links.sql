-- CRM deal links for bilateral HubSpot / Salesforce sync (Phase 2).
-- Apply after 008_ingest_metadata.sql

CREATE TABLE IF NOT EXISTS crm_deal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('hubspot', 'salesforce')),
  external_deal_id TEXT NOT NULL,
  post_mortem_id UUID REFERENCES call_post_mortems(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  account_id TEXT,
  sales_cycle_days INTEGER,
  historical_crm_context JSONB,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_deal_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_deal_links_post_mortem
  ON crm_deal_links (post_mortem_id);

CREATE INDEX IF NOT EXISTS idx_crm_deal_links_user
  ON crm_deal_links (user_id);

ALTER TABLE crm_deal_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_deal_links_select_own ON crm_deal_links;
CREATE POLICY crm_deal_links_select_own ON crm_deal_links
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS crm_deal_links_insert_own ON crm_deal_links;
CREATE POLICY crm_deal_links_insert_own ON crm_deal_links
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS crm_deal_links_update_own ON crm_deal_links;
CREATE POLICY crm_deal_links_update_own ON crm_deal_links
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

COMMENT ON TABLE crm_deal_links IS
  'Maps HubSpot/Salesforce deals to Lazarus analyses for bilateral sync. Service role writes from API.';
