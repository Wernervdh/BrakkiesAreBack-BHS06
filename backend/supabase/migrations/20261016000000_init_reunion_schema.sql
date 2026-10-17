-- ========================================================
-- BrakkeBack BHS '06 - Supabase Database Schema Migration
-- Matrix 2006 • 20 Jaar Reünie (Brackenfell High)
-- ========================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------
-- Table 1: profiles (Lightweight Guest Registry)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  display_name TEXT NOT NULL,
  email TEXT,
  is_organizer BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anonymous public read & insert for zero-friction access
CREATE POLICY "Allow anonymous read profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Allow anonymous insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow organizers update profiles"
  ON public.profiles FOR UPDATE
  USING (true);

-- --------------------------------------------------------
-- Table 2: photos (Secret Agent Snaps / Paparazzi Feed)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  author_name TEXT NOT NULL,
  prompt_tag TEXT NOT NULL,
  image_url TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  is_approved BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

-- Anonymous read for approved photos (or all for organizers)
CREATE POLICY "Allow public read approved photos"
  ON public.photos FOR SELECT
  USING (is_approved = true);

CREATE POLICY "Allow anonymous insert photos"
  ON public.photos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update likes and moderation"
  ON public.photos FOR UPDATE
  USING (true);

-- --------------------------------------------------------
-- Table 3: messages (Time Capsule & Wall of Fame)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  author_name TEXT NOT NULL,
  content VARCHAR(500) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('thank_you', 'memory', 'prediction_30th'))
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read messages"
  ON public.messages FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (true);

-- --------------------------------------------------------
-- Table 4: then_now_profiles (Face Matcher Game)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.then_now_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name TEXT NOT NULL,
  yearbook_image_url TEXT NOT NULL,
  current_image_url TEXT NOT NULL,
  votes_most_changed INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.then_now_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read then_now_profiles"
  ON public.then_now_profiles FOR SELECT
  USING (true);

CREATE POLICY "Allow public update then_now_profiles votes"
  ON public.then_now_profiles FOR UPDATE
  USING (true);

CREATE POLICY "Allow public insert then_now_profiles"
  ON public.then_now_profiles FOR INSERT
  WITH CHECK (true);

-- --------------------------------------------------------
-- Helper Functions (RPC)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_photo_likes(target_photo_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.photos
  SET likes_count = likes_count + 1
  WHERE id = target_photo_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_then_now_vote(target_profile_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.then_now_profiles
  SET votes_most_changed = votes_most_changed + 1
  WHERE id = target_profile_id;
END;
$$;

-- --------------------------------------------------------
-- Realtime Subscriptions Configuration
-- --------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.photos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.then_now_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- --------------------------------------------------------
-- Supabase Storage Configuration (Bucket: reunion-media)
-- --------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('reunion-media', 'reunion-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
CREATE POLICY "Public Read Reunion Media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'reunion-media');

CREATE POLICY "Public Insert Reunion Media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'reunion-media');
