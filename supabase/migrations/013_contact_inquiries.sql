-- Inbound marketing contact form. Service-role only (no browser access).

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  topic TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_created ON contact_inquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_email ON contact_inquiries (email);

ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_contact_inquiries" ON contact_inquiries;
DROP POLICY IF EXISTS "deny_authenticated_contact_inquiries" ON contact_inquiries;
CREATE POLICY "deny_anon_contact_inquiries" ON contact_inquiries FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated_contact_inquiries" ON contact_inquiries FOR ALL TO authenticated USING (false) WITH CHECK (false);
