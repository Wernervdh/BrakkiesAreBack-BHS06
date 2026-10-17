# '06 BrakkiesAreBack: BHS Matric 2006 Reunion App

The live photo wall and guest book for the Brackenfell High School Matric class of 2006 20-year reunion.
Guests scan a QR code, check in on their phone (no app, no password) and share the night together.

**Live:** https://brakkies-are-back-bhs-06.vercel.app

## How it works

### For guests
1. **Scan the QR code** at the venue (or open the link).
2. **Check in** with your name, surname and email. Your phone becomes your "account". Each name and each email can check in once.
   - The email is only used to keep one check-in per person. The app stores only a scrambled fingerprint of it, never the address itself. Nobody can see it, and the app never sends email.
3. **📸 Paparazzi**: tap *Snap* to take or choose a photo, pick a theme, add a caption and tag classmates. Give photos a ❤️ (one per person; tap again to undo).
4. **💬 Time Capsule**: write a thank-you, a memory or a prediction for the 30th, and tag classmates.
5. **🎭 Then & Now**: post your 2006 matric photo next to a selfie from tonight. Everyone can vote once per entry for "Most Changed" (not for yourself).
6. **👥 Who's Here**: see who has checked in.
7. You can delete your own posts any time, remove your tag from someone else's post, or use **☰ → Leave & delete my data**.

### For organisers
- **Get organiser rights:** ☰ → *Organiser access* → enter the organiser code. An organiser can also tap *Make organiser* next to a classmate in *Who's Here*.
- **Moderate:** delete any photo or note (🗑️), remove a guest (this deletes **everything** they posted).
- **📖 The Story:** a chronological album of the whole night, hour by hour. It stays hidden until an organiser publishes it in ☰ → *Organiser tools*. Organisers can preview it first.
- **📘 Facebook pack:** ☰ → *Organiser tools* → *Open Facebook pack*. Tick the photos that should go to Facebook (the shortlist is shared by all organisers), then *Download ZIP*. It contains the photos plus `captions.csv` with each caption and who to tag. Email, WhatsApp or Google Drive the ZIP to whoever posts in the class Facebook group. (Facebook doesn't let apps post into groups or tag people automatically.)
- **Exports:** guest list, notes and photo list (with links) as CSV for Excel or Google Sheets.

## Setup (one time, Supabase dashboard)
1. **Authentication → Sign In / Providers → Allow anonymous sign-ins: ON.**
2. **Authentication → Rate limits:** raise *anonymous sign-ins per hour* (default 30 per IP; everyone on venue Wi-Fi shares one IP), e.g. to 300.
3. **SQL editor:** run [`backend/supabase/migrations/20261017000000_secure_rebuild.sql`](backend/supabase/migrations/20261017000000_secure_rebuild.sql). ⚠️ It wipes all existing app data.
4. **SQL editor:** set the organiser code (keep it out of git, because this repo is public):
   ```sql
   select private.set_organizer_code('a-long-secret-code');
   ```
5. **Storage → reunion-media:** delete the old test files (folders `photos`, `deleted`, `metadata`).

## Development
```bash
cd frontend
npm install
npm start          # http://localhost:4200
npm run build      # production build → dist/brakkeback-bhs06
```
Supabase URL + publishable key are in `frontend/src/environments/`. The publishable key is public by design; all access is enforced by Row Level Security in the database.

Deploying: push to `main`. Vercel builds and publishes automatically.

Technical notes for maintainers: [CLAUDE.md](CLAUDE.md).
