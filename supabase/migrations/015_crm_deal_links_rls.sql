-- Tighten CRM deal-link RLS: rows must belong to the signed-in user.
-- Service role (API) still bypasses RLS for owner-scoped webhook updates.

DROP POLICY IF EXISTS crm_deal_links_select_own ON crm_deal_links;
CREATE POLICY crm_deal_links_select_own ON crm_deal_links
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS crm_deal_links_insert_own ON crm_deal_links;
CREATE POLICY crm_deal_links_insert_own ON crm_deal_links
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS crm_deal_links_update_own ON crm_deal_links;
CREATE POLICY crm_deal_links_update_own ON crm_deal_links
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE crm_deal_links IS
  'Maps HubSpot/Salesforce deals to Lazarus analyses. RLS requires user_id = auth.uid(); API uses service role.';
