-- Per-account Stripe entitlements (1:1 with auth.users).
-- Users may SELECT their own row. Writes are service role only (API + webhooks).

CREATE TABLE IF NOT EXISTS billing_customers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'ppu', 'entry', 'team')),
  status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'active', 'past_due', 'canceled')),
  free_used INTEGER NOT NULL DEFAULT 0 CHECK (free_used >= 0),
  ppu_credits INTEGER NOT NULL DEFAULT 0 CHECK (ppu_credits >= 0),
  entry_used_this_period INTEGER NOT NULL DEFAULT 0 CHECK (entry_used_this_period >= 0),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_billing_customers_stripe_customer
  ON billing_customers (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE billing_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_select_own" ON billing_customers;
DROP POLICY IF EXISTS "deny_anon_billing" ON billing_customers;

CREATE POLICY "billing_select_own"
  ON billing_customers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "deny_anon_billing"
  ON billing_customers FOR ALL TO anon
  USING (false) WITH CHECK (false);

COMMENT ON TABLE billing_customers IS
  'Per-account Stripe entitlements. Users SELECT own row; writes are service role only.';
