# '06 BrakkiesAreBack: BHS Matric 2006 Reunion App

The live photo wall and guest book for the Brackenfell High School Matric class of 2006 20-year reunion.
Guests scan a QR code, check in on their phone (no app, no password) and share the night together.

> To close the app temporarily (a "closed for now" page; all data kept), set `APP_CLOSED = true` in `frontend/src/app/app-status.ts` and push to `main`; set it back to `false` to reopen.

**Live:** https://brakkies-are-back-bhs-06.vercel.app · **Venue QR code & printable poster:** [`docs/qr/`](docs/qr/)

## How it works

### For guests
1. **Scan the QR code** at the venue (or open the link).
2. **Check in** with your name, surname and email. Your phone becomes your "account". Each name and each email can check in once.
   - The email is only used to keep one check-in per person. The app stores only a scrambled fingerprint of it, never the address itself. Nobody can see it, and the app never sends email.
3. **📸 Paparazzi**: tap *Snap* to take or choose a photo, pick a theme, add a caption and tag classmates (start typing, e.g. "W", and pick from the suggestions: only checked-in classmates are suggested). Give photos a ❤️ (one per person; tap again to undo).
4. **💬 Time Capsule**: write a thank-you, a memory or a prediction for the 30th, and tag classmates.
5. **🎭 Then & Now**: post your 2006 matric photo next to a selfie from tonight. Everyone can vote once per entry for "Most Changed" (not for yourself).
6. **👥 Who's Here**: see who has checked in.
7. You can delete your own posts any time and remove your tag from someone else's post.
8. **☰ → Log out** keeps everything you posted. After **30 minutes without activity** you're logged out automatically (nothing is deleted). To log back in, on any phone, check in with **exactly the same name and email**. One phone at a time: logging in elsewhere logs out the other phone.
9. **☰ → Leave & delete my data** removes you and everything you posted, permanently. It first shows exactly what will be deleted and offers "Just log out (keep everything)" instead.

### For organisers
- **Log in:** on the welcome page tap the **🛡️ Organiser login** button (under the check-in card) and enter **only the organiser code**. No name or email needed; the session gets a name like "Organiser 7F3K". **☰ → Log out** ends the organiser session; log in again any time with the code.
- **Moderator only:** organiser accounts can view everything and remove what isn't appropriate, but **cannot post, upload, heart or vote** (enforced by the database). To join in as yourself, check in as a normal guest on another phone or browser.
- **Moderate:** delete any photo, note or Then & Now entry (🗑️); remove a guest (this deletes **everything** they posted). Who's Here shows classmates only; organisers also see an "Organisers logged in" list where they can end an unknown organiser session.
- **📖 The Story:** a chronological album of the whole night, hour by hour. It stays hidden until an organiser publishes it in ☰ → *Organiser tools*. Organisers can preview it first.
- **Super admin:** a second, separate **super admin code** (same login button). The super admin can do everything organisers can, **plus the Facebook pack and the activity log**. The super admin is invisible to everyone else (also through the API), and regular organisers can't remove its session.
- **🧾 Activity log (super admin only):** ☰ → *Organiser tools* → *Open activity log*. Who did what and when: log-ins and log-outs, failed logins, posts, deletes (and by whom), hearts, votes, tags, removals, Story and shortlist changes. Filters, search, live refresh, CSV export. No emails, photos or note texts are stored; guests who leave and delete their data show as "(deleted guest)". Nobody can edit or delete entries.
- **📘 Facebook pack (super admin only):** ☰ → *Organiser tools* → *Open Facebook pack*. Tick the photos that should go to Facebook (the shortlist is shared by all organisers), then *Download ZIP*. It contains the photos plus `captions.csv` with each caption and who to tag. Email, WhatsApp or Google Drive the ZIP to whoever posts in the class Facebook group. (Facebook doesn't let apps post into groups or tag people automatically.)
- **Exports:** guest list, notes and photo list (with links) as CSV for Excel or Google Sheets.

## Setup (one time, Supabase dashboard)
1. **Authentication → Sign In / Providers → Allow anonymous sign-ins: ON.**
2. **Authentication → Rate limits:** raise *anonymous sign-ins per hour* (default 30 per IP; everyone on venue Wi-Fi shares one IP), e.g. to 300.
3. **SQL editor:** run [`backend/supabase/migrations/20261017000000_secure_rebuild.sql`](backend/supabase/migrations/20261017000000_secure_rebuild.sql) (⚠️ wipes all app data), then [`20261017120000_organiser_accounts.sql`](backend/supabase/migrations/20261017120000_organiser_accounts.sql) , [`20261017180000_log_out_and_back_in.sql`](backend/supabase/migrations/20261017180000_log_out_and_back_in.sql), [`20261017220000_super_admin.sql`](backend/supabase/migrations/20261017220000_super_admin.sql), [`20261017230000_hide_super_admin.sql`](backend/supabase/migrations/20261017230000_hide_super_admin.sql) and [`20261017235000_activity_log.sql`](backend/supabase/migrations/20261017235000_activity_log.sql) (all keep data). Always run them in this order.
4. **SQL editor:** set the organiser code and the (different) super admin code. Keep both out of git, because this repo is public:
   ```sql
   select private.set_organizer_code('a-long-secret-code');
   select private.set_super_admin_code('a-different-long-secret-code');
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
