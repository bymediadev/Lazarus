-- Run in Supabase SQL Editor if call_post_mortems already exists without deal_status

ALTER TABLE call_post_mortems
ADD COLUMN IF NOT EXISTS deal_status TEXT NOT NULL DEFAULT 'stalled';

ALTER TABLE call_post_mortems
DROP CONSTRAINT IF EXISTS call_post_mortems_deal_status_check;

ALTER TABLE call_post_mortems
ADD CONSTRAINT call_post_mortems_deal_status_check
CHECK (deal_status IN ('failed', 'stalled', 'successful'));
