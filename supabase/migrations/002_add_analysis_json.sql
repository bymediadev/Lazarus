-- ONLY run this if call_post_mortems already exists.
-- Fresh install? Run supabase/setup.sql instead.

ALTER TABLE call_post_mortems
ADD COLUMN IF NOT EXISTS analysis_json JSONB;