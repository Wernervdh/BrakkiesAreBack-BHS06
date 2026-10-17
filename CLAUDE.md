# BrakkeBack BHS '06 – Project Notes

> **Keep this file up to date.** Whenever code, architecture, schema, config or behaviour changes, update the relevant section in the same change (standing instruction from the owner). User-facing docs live in [README.md](README.md).

Reunion web app for Brackenfell High School, Matric 2006, 20-year reunion. Guests scan a QR code, check in (name + surname + email, no password) and share photos, notes and Then & Now pictures live. Original (partly outdated) spec: [REUNION_APP_SPEC.md](REUNION_APP_SPEC.md).

## Stack & deployment
- `frontend/`: Angular 19 standalone components + signals, Tailwind 3, `@supabase/supabase-js`, `fflate` (ZIP). No server code.
- **Supabase** is the only backend: Postgres + RLS, anonymous Auth, Realtime, Storage bucket `reunion-media`.
- **Deploy pipeline**: push to `main` on GitHub (`Wernervdh/BrakkiesAreBack-BHS06`) → Vercel builds `frontend/` → https://brakkies-are-back-bhs-06.vercel.app. `frontend/vercel.json` holds the SPA rewrite + security headers (CSP, HSTS, X-Frame-Options...).
- The old Express/WebSocket LAN server (`backend/server.js`) and the email-digest edge function were removed (insecure / unused).

## Database migrations (run in this order in the Supabase SQL editor)
1. `20261017000000_secure_rebuild.sql`: re-runnable; **drops and recreates all app tables** (wipes data).
2. `20261017120000_organiser_accounts.sql`: keeps data, re-runnable. Separate moderator-only organiser accounts (see "Organisers").
3. `20261017180000_log_out_and_back_in.sql`: keeps data, re-runnable. Profiles decoupled from logins (log out / log back in).
Later migrations replace functions/policies from earlier ones, so **after re-running an earlier file, re-run all later ones**. Tested with PGlite (97 + 48 + 63 scenarios, see "Testing"). All three applied to the live project on 2026-10-17.

Schema (after all three):
- `profiles` (id uuid, unique lower(display_name), `is_organizer`). No FK to auth.users: a profile outlives the login that created it (new profiles reuse the creating login's id). Created **only** via RPCs `check_in` / `organizer_login`; no insert/update grants.
- `private.profile_sessions` (auth_uid PK → profile_id UNIQUE): links the current anonymous login to a profile; **one login per profile, newest wins**. `public.current_profile_id()` resolves it and is used by every policy/trigger instead of `auth.uid()`. `public.my_profile()` returns the caller's profile; `public.end_session()` logs out (unlinks; nothing deleted).
- `private.email_fingerprints`: HMAC-SHA256 of lower(email) with `private.settings.email_pepper`; unique → one check-in per email. The address itself is never stored; nobody (not organisers) can read fingerprints.
- `photos` (owner_id, author_name, prompt_tag, caption ≤140, image_path `photos/<profile id>/...`, likes_count, shortlisted), `photo_likes` (PK photo+user), `photo_tags`.
- `messages` (content 1–500, category thank_you|memory|prediction_30th), `message_tags`.
- `then_now_entries` (one per guest; then_path/now_path under `then-now/<profile id>/`), `then_now_votes` (no self-votes).
- `app_settings.story_published` (read: everyone; change: `set_story_published()` organisers only).
- Trigger `private.stamp_new_content` stamps owner/author/created_at, zeroes counters, validates image paths, rate-limits (20 photos / 10 messages per 10 min). Trigger `private.sync_counter` maintains likes/votes counts.
- RPCs: `check_in(name, email)` (new guest, or log back in when name + email fingerprint match; returns null on a name/email mismatch; 5 wrong tries per name per 15 min via `private.login_attempts`, 200 global), `organizer_login(name, code)` (new organiser or log back in by organiser name; returns null on wrong code; bcrypt hash in `private.settings`; 5 tries/15 min per login, 50 global), `my_profile()`, `end_session()`, `current_profile_id()`, `set_photo_shortlisted(target, bool)`, `set_story_published(bool)`, `is_organizer()`. SQL-editor only: `private.set_organizer_code(code)`. (`claim_organizer` / `set_organizer` were removed by migration 2.)
- Deleting a profile **cascades to everything the guest posted** (photos, notes, Then & Now, likes, votes, tags, fingerprint). The client deletes the guest's storage folder first (`ReunionService.removeUserFiles`).
- `anon` role has no access to anything. Storage: public read by URL, no listing; upload only into own folder, jpg/png/webp, 5 MB.

## Frontend structure (`frontend/src/app`)
- Routes (`app.routes.ts`): `/welcome` (redirects to /feed if checked in; has the "Organiser login" link), `/feed` (checked-in guard), `/story` (published or organiser), `/organiser/facebook` (organiser), `/about` (public).
- Services: `supabase.service.ts` (client + public URLs), `session.service.ts` (anonymous sign-in, profile via `my_profile`, guest check-in / log back in, organiser login, log out, leave, 30-min inactivity log-out (`INACTIVITY_LIMIT_MS`, last activity in localStorage `brakke_last_active`), `notice` shown on the welcome page; re-checks the profile every minute to notice "logged in elsewhere" / removal; `userId` = current **profile** id), `reunion.service.ts` (all data + one Realtime channel + optimistic likes/votes + tags + story flag + refetch after 30 s in background), `ui.service.ts` (toasts + confirm dialog, rendered by `shared/ui-overlay.component.ts`).
- Components: `welcome`, `about` (also "How it works"), `dashboard` (header, ☰ menu, bottom tabs) with tabs `photo-feed`, `capsule`, `then-now`, `guests`; modals `photo-modal`, `then-now-modal`, `message-modal`, `organizer-login-modal` (welcome page), `organizer-tools-modal`; `story`; `organizer/facebook-pack`; shared `crest`, `tag-picker`, `tag-list`.
- Utils: `image.ts` (resize to ≤1600px JPEG, strips EXIF/GPS; `randomId` works without secure context), `errors.ts` (`friendlyError`, `UserFacingError`), `format.ts` (names, CSV with formula-injection guard, downloads).
- Theme from the crest: `brakke-*` colours in `tailwind.config.js`, component classes (`btn-primary`, `card`, `input`, `chip-on`...) in `styles.css`. Crest: `public/crest.svg`.
- Production build: no source maps, `inlineCritical: false` (CSP blocks the inline onload handler it would add).

## Behaviour notes
- Likes/votes: one per guest, toggle to undo. Can't vote for your own Then & Now.
- Tags: only checked-in guests; only the poster adds tags (max 20); tagged guest/poster/organiser can remove.
- Owners delete their own posts.
- **Organisers** are separate moderator accounts: welcome page → "🛡️ Organiser login" button → **code only**. The app generates the session name ("Organiser 7F3K", random suffix, retried on clash) and calls `organizer_login(name, code)`; each login is a fresh organiser profile. They can view everything, delete any photo/note/Then & Now/guest/other organiser, publish the Story, shortlist + ZIP photos (Facebook pack: photos + captions.csv with who to tag) and export CSVs. They **cannot** post, upload, heart, vote or be tagged (DB-enforced; UI hides those controls; `ReunionService.requireGuest`). Guests can't become organisers. ☰ → "Log out" (or 30-min idle) **deletes** the organiser profile (nothing to keep); log in again with the code. Who's Here lists guests only; organisers additionally see "Organisers logged in" (can remove stale sessions). Facebook's API can't post to groups or tag people, hence the ZIP.
- Guests: ☰ → "Log out" keeps everything; automatic log-out after 30 min without activity (client-side timer; data kept). Log back in on any device with exactly the same name + email (email is unverified: anyone knowing both could log in as that guest; mitigated by the per-name lockout and newest-login-wins). ☰ → "Leave & delete my data" first shows a dialog listing what will be deleted (`ReunionService.countMyContent`) with "Just log out (keep everything)" as the highlighted alternative (`UiService.choose`), then deletes the guest's profile (cascade) + files and signs out.
- Tag picker (`shared/tag-picker`): predictive combobox; suggestions on focus; word-start matches first ("W" → "Werner", "van der Walt"), then substring; ↑/↓/Enter/Esc; Enter never submits the form; only guests (no self, no organisers).
- `ReunionService.guests` = profiles without organisers (Who's Here count, tag picker, Story stats).

## Supabase dashboard settings (required)
1. Authentication → Sign In / Providers → **Allow anonymous sign-ins: ON**.
2. Authentication → Rate limits → raise "anonymous sign-ins per hour" (default 30/IP; venue Wi-Fi shares one IP), e.g. 300.
3. Run all migrations (in order) in the SQL editor, then `select private.set_organizer_code('<long secret>');` (never commit the code; repo is public).
4. Storage → `reunion-media`: delete leftover files from the old version (`photos/`, `deleted/`, `metadata/`).
Optional: enable CAPTCHA (Turnstile) for anonymous sign-ins against scripted spam.

## Testing
- DB: PGlite harness (kept outside the repo in the session scratchpad) stubs `auth.uid()`, roles and the storage schema, runs the migration twice and checks the RLS/RPC scenarios. Docker isn't available on this machine (WSL feature off).
- UI: headless Chromium smoke tests via the browser-automation skill against `ng serve`.
- DB harnesses (scratchpad): `test.mjs <1>` (97 checks), `test2.mjs <1> <2>` (48: organiser login, moderator-only, guest regressions, data kept), `test3.mjs <1> <2> <3>` (63: existing sessions kept, log out keeps data, log back in by name+email, wrong-email lockout, newest login wins, organiser log out/in, remove/leave).
- E2E (2026-10-17, against the live Supabase project after the migration): two guests in separate browser contexts — check-in, duplicate name/email rejected, Who's Here no duplicates, photo + tag live, heart toggle, untag, note + tag, Then & Now + vote (no self-vote), Story hidden for guests, organiser code (wrong/right), Story preview, shortlist + ZIP, guest blocked from Facebook pack, organiser removes guest (all content gone, guest sent to welcome), leave & delete. 21/21 passed, 0 console errors. Test guests clean up after themselves (orphan anonymous auth users remain; harmless).
- E2E #2 (2026-10-17, live site + live DB after migrations 2 + 3): guests post/heart/tag/note, log out keeps data, wrong email rejected, log back in (case-insensitive), newest login wins, 31-min idle → logged out with data kept, organiser login (wrong/right code), organiser can't post/heart/write/vote, organiser deletes a note (gone live), organiser log out + back in, organiser not taggable, organiser removes a guest, leave & delete, test organiser cleaned up. 22/22 passed, 0 console errors. (Chromium logs the successful 204 `/auth/v1/logout` as ERR_ABORTED afterwards; harmless.)
- E2E #3 (2026-10-17, local + live site, `qa-e2e4.mjs`): visible organiser button, predictive tagging (suggestions on focus, "W" → surname word-start first with highlight, unique surname + Enter tags without posting), leave dialog (lists "1 photo", offers log out), just log out keeps data, wrong email rejected, log back in, newest login wins, 31-min idle, code-only organiser login (wrong/right), organiser can't snap/heart/write/vote, guests don't see organisers, organiser deletes note / removes guest, organiser log out removes the session and logs in again, delete everything removes the photo for others. 21/21 passed locally and live, 0 console errors. (HEAD count requests and `/auth/v1/logout` show as ERR_ABORTED in Chromium after succeeding; harmless.) Note: an aborted run can leave test guests behind; `qa-cleanup.mjs` (RUN_ID) logs in as them and uses Leave & delete.
- `npx ng build` must be warning-free.

## Known limitations / ideas
- Log back in uses an unverified email (no email is sent). Email OTP verification would need an SMTP provider (e.g. Resend) configured in Supabase.
- The 30-minute inactivity log-out is client-side (a convenience/privacy feature on shared phones, not a server-enforced session limit).
- No offline/service worker yet; no image thumbnails (Supabase image transforms need a paid plan).
- Photos are public to anyone who has the exact (unguessable) URL.
