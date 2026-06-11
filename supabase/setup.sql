-- Lazarus — FULL SETUP (run this first in Supabase SQL Editor)
-- Use this if you get: relation "call_post_mortems" does not exist

CREATE TABLE IF NOT EXISTS call_post_mortems (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    client_name TEXT DEFAULT 'Unknown Deal',
    deal_value NUMERIC DEFAULT 0,
    deal_status TEXT NOT NULL DEFAULT 'STALLED — RECOVERABLE',
    stall_cause TEXT NOT NULL,
    why_it_stalled TEXT NOT NULL,
    restart_plan TEXT NOT NULL,
    transcript_text TEXT,
    analysis_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE call_post_mortems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own post-mortems" ON call_post_mortems;
DROP POLICY IF EXISTS "Users can view their own post-mortems" ON call_post_mortems;

CREATE POLICY "Users can create their own post-mortems"
    ON call_post_mortems FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own post-mortems"
    ON call_post_mortems FOR SELECT
    USING (auth.uid() = user_id);

-- Allow server-side saves via service role key (bypasses RLS automatically)
