-- Seed Data for BrakkeBack BHS '06 20-Year Reunion
-- Class of 2006 (Brackenfell High School)

INSERT INTO public.profiles (display_name, email, is_organizer) VALUES
  ('Dirk Van Der Merwe', 'dirk@brakke06.co.za', true),
  ('Anri Smith', 'anri@brakke06.co.za', true),
  ('Francois Pienaar', 'francois@gmail.com', false),
  ('Chantal Louw', 'chantal@outlook.com', false)
ON CONFLICT DO NOTHING;

INSERT INTO public.messages (author_name, content, category) VALUES
  ('Dirk Van Der Merwe', 'Welkom almal by ons 20 Jaar Brackenfell High Reünie! Groot dankie aan die reëlingskomitee vir al die moeite met die WhatsApp groep.', 'thank_you'),
  ('Anri Smith', 'Onthou julle nog Mnr. De Klerk se wiskunde-klasse en die saalbyeenkomste? So wonderlik om almal vanaand weer te sien!', 'memory'),
  ('Francois Pienaar', 'Voorspelling vir ons 30ste reünie: Dirk het nog steeds dieselfde bakkie en Chantal vlieg hierheen met haar eie helikopter.', 'prediction_30th'),
  ('Chantal Louw', 'Baie dankie Matrix 2006 organizers! Julle het dit reggekry om ons almal na 20 jaar weer bymekaar te kry.', 'thank_you')
ON CONFLICT DO NOTHING;

INSERT INTO public.then_now_profiles (student_name, yearbook_image_url, current_image_url, votes_most_changed) VALUES
  ('Dirk Van Der Merwe', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=60', 4),
  ('Anri Smith', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&auto=format&fit=crop&q=60', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&auto=format&fit=crop&q=60', 7),
  ('Francois Pienaar', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=60', 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=500&auto=format&fit=crop&q=60', 12)
ON CONFLICT DO NOTHING;

INSERT INTO public.photos (author_name, prompt_tag, image_url, likes_count, is_approved) VALUES
  ('Dirk Van Der Merwe', 'Mid-laugh', 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&auto=format&fit=crop&q=60', 15, true),
  ('Anri Smith', 'Then & Now', 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&auto=format&fit=crop&q=60', 22, true),
  ('Francois Pienaar', 'Unchanged', 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=60', 9, true)
ON CONFLICT DO NOTHING;
