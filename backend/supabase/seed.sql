-- Clean initialization for BrakkeBack BHS '06 20-Year Reunion
-- Class of 2006 (Brackenfell High School)

TRUNCATE TABLE public.photos CASCADE;
TRUNCATE TABLE public.messages CASCADE;
TRUNCATE TABLE public.then_now_profiles CASCADE;
TRUNCATE TABLE public.profiles CASCADE;

-- Insert single organizer / admin user
INSERT INTO public.profiles (display_name, is_organizer) VALUES
  ('06BrakkieAdmin', true)
ON CONFLICT DO NOTHING;
