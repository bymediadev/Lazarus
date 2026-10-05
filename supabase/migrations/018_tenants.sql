-- Company workspaces. One membership per user. Deal rows and Google tokens
-- carry tenant_id. HubSpot, Salesforce, Zoom, and Teams stay in encrypted files.
-- The migration runner wraps this file; do not add BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE call_post_mortems ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE rescue_outcomes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE crm_deal_links ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE google_oauth_tokens ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members (tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_post_mortems_tenant_id ON call_post_mortems (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rescue_outcomes_tenant_id ON rescue_outcomes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_links_tenant_id ON crm_deal_links (tenant_id);
CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_tenant_id ON google_oauth_tokens (tenant_id);

-- Workspace of one for each existing account. Null user_id rows stay null.
-- google_oauth_tokens.id is the user id (text). Leave the legacy 'default' row unset.
DO $$
DECLARE
  user_row RECORD;
  new_tenant_id UUID;
  parsed_workspace_name TEXT;
  local_part TEXT;
BEGIN
  FOR user_row IN SELECT id, email FROM auth.users LOOP
    IF EXISTS (SELECT 1 FROM tenant_members WHERE user_id = user_row.id) THEN
      CONTINUE;
    END IF;

    local_part := NULL;
    IF user_row.email IS NOT NULL AND btrim(user_row.email) <> '' THEN
      local_part := btrim(split_part(user_row.email, '@', 1));
    END IF;
    IF local_part IS NULL OR local_part = '' THEN
      parsed_workspace_name := 'Workspace';
    ELSE
      parsed_workspace_name := local_part || ' Workspace';
    END IF;

    INSERT INTO tenants (company_name)
    VALUES (parsed_workspace_name)
    RETURNING id INTO new_tenant_id;

    INSERT INTO tenant_members (user_id, tenant_id)
    VALUES (user_row.id, new_tenant_id);

    UPDATE call_post_mortems SET tenant_id = new_tenant_id WHERE user_id = user_row.id;
    UPDATE rescue_outcomes SET tenant_id = new_tenant_id WHERE user_id = user_row.id;
    UPDATE crm_deal_links SET tenant_id = new_tenant_id WHERE user_id = user_row.id;
    UPDATE google_oauth_tokens
      SET tenant_id = new_tenant_id
      WHERE id = user_row.id::text
        AND id <> 'default';
  END LOOP;
END $$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invites FORCE ROW LEVEL SECURITY;

REVOKE ALL ON tenants, tenant_members, tenant_invites FROM anon, authenticated, PUBLIC;

COMMENT ON TABLE tenants IS
  'Company workspace. Members manage their own deals and connections. API uses service role and filters by tenant_id.';
COMMENT ON TABLE tenant_members IS
  'One company per user. Invite acceptance is a later pass.';
