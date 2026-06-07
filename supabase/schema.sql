-- Lazarus Deal Rescue Console — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor

CREATE TABLE call_post_mortems (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    client_name TEXT DEFAULT 'Unknown Deal',
    deal_value NUMERIC DEFAULT 0,
    stall_cause TEXT NOT NULL,
    why_it_stalled TEXT NOT NULL,
    restart_plan TEXT NOT NULL,
    transcript_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE call_post_mortems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own post-mortems"
    ON call_post_mortems FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own post-mortems"
    ON call_post_mortems FOR SELECT
    USING (auth.uid() = user_id);
