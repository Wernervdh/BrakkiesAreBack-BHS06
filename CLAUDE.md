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
2. `20261017120000_organiser_accounts.sql`: keeps data, re-runnable. Separate moderator-only organiser accounts (see "Organisers"). It replaces `private.stamp_new_content` and several policies, so **after re-running (1) always re-run (2)**.
Both tested with PGlite (97 + 48 scenarios, see "Testing"). Applied to the live project on 2026-10-17.

Schema (after both):
- `profiles` (id = `auth.uid()`, unique lower(display_name), `is_organizer`). Created **only** via RPC `check_in(name, email)`; no insert/update grants.
- `private.email_fingerprints`: HMAC-SHA256 of lower(email) with `private.settings.email_pepper`; unique → one check-in per email. The address itself is never stored; nobody (not organisers) can read fingerprints.
- `photos` (owner_id, author_name, prompt_tag, caption ≤140, image_path `photos/<uid>/...`, likes_count, shortlisted), `photo_likes` (PK photo+user), `photo_tags`.
- `messages` (content 1–500, category thank_you|memory|prediction_30th), `message_tags`.
- `then_now_entries` (one per guest; then_path/now_path under `then-now/<uid>/`), `then_now_votes` (no self-votes).
- `app_settings.story_published` (read: everyone; change: `set_story_published()` organisers only).
- Trigger `private.stamp_new_content` stamps owner/author/created_at, zeroes counters, validates image paths, rate-limits (20 photos / 10 messages per 10 min). Trigger `private.sync_counter` maintains likes/votes counts.
- RPCs: `check_in(name, email)` (guests), `organizer_login(name, code)` (organisers; returns null on wrong code; bcrypt hash in `private.settings`; 5 tries/15 min per user, 50 global), `set_photo_shortlisted(target, bool)`, `set_story_published(bool)`, `is_organizer()`. SQL-editor only: `private.set_organizer_code(code)`. (`claim_organizer` / `set_organizer` were removed by migration 2.)
- Deleting a profile **cascades to everything the guest posted** (photos, notes, Then & Now, likes, votes, tags, fingerprint). The client deletes the guest's storage folder first (`ReunionService.removeUserFiles`).
- `anon` role has no access to anything. Storage: public read by URL, no listing; upload only into own folder, jpg/png/webp, 5 MB.

## Frontend structure (`frontend/src/app`)
- Routes (`app.routes.ts`): `/welcome` (redirects to /feed if checked in; has the "Organiser login" link), `/feed` (checked-in guard), `/story` (published or organiser), `/organiser/facebook` (organiser), `/about` (public).
- Services: `supabase.service.ts` (client + public URLs), `session.service.ts` (anonymous sign-in, profile, guest check-in, organiser login, leave/log out), `reunion.service.ts` (all data + one Realtime channel + optimistic likes/votes + tags + story flag + refetch after 30 s in background), `ui.service.ts` (toasts + confirm dialog, rendered by `shared/ui-overlay.component.ts`).
- Components: `welcome`, `about` (also "How it works"), `dashboard` (header, ☰ menu, bottom tabs) with tabs `photo-feed`, `capsule`, `then-now`, `guests`; modals `photo-modal`, `then-now-modal`, `message-modal`, `organizer-login-modal` (welcome page), `organizer-tools-modal`; `story`; `organizer/facebook-pack`; shared `crest`, `tag-picker`, `tag-list`.
- Utils: `image.ts` (resize to ≤1600px JPEG, strips EXIF/GPS; `randomId` works without secure context), `errors.ts` (`friendlyError`, `UserFacingError`), `format.ts` (names, CSV with formula-injection guard, downloads).
- Theme from the crest: `brakke-*` colours in `tailwind.config.js`, component classes (`btn-primary`, `card`, `input`, `chip-on`...) in `styles.css`. Crest: `public/crest.svg`.
- Production build: no source maps, `inlineCritical: false` (CSP blocks the inline onload handler it would add).

## Behaviour notes
- Likes/votes: one per guest, toggle to undo. Can't vote for your own Then & Now.
- Tags: only checked-in guests; only the poster adds tags (max 20); tagged guest/poster/organiser can remove.
- Owners delete their own posts.
- **Organisers** are separate moderator accounts: welcome page → "Organiser login" (name + code, no email). They can view everything, delete any photo/note/Then & Now/guest/other organiser, publish the Story, shortlist + ZIP photos (Facebook pack: photos + captions.csv with who to tag) and export CSVs. They **cannot** post, upload, heart, vote or be tagged (DB-enforced; UI hides those controls; `ReunionService.requireGuest`). Guests can't become organisers. ☰ → "Log out" deletes the organiser profile and signs out (nothing to lose). Facebook's API can't post to groups or tag people, hence the ZIP.
- Guests: ☰ → "Leave & delete my data" deletes the guest's profile (cascade) + files and signs out.
- `ReunionService.guests` = profiles without organisers (Who's Here count, tag picker, Story stats).

## Supabase dashboard settings (required)
1. Authentication → Sign In / Providers → **Allow anonymous sign-ins: ON**.
2. Authentication → Rate limits → raise "anonymous sign-ins per hour" (default 30/IP; venue Wi-Fi shares one IP), e.g. 300.
3. Run both migrations (in order) in the SQL editor, then `select private.set_organizer_code('<long secret>');` (never commit the code; repo is public).
4. Storage → `reunion-media`: delete leftover files from the old version (`photos/`, `deleted/`, `metadata/`).
Optional: enable CAPTCHA (Turnstile) for anonymous sign-ins against scripted spam.

## Testing
- DB: PGlite harness (kept outside the repo in the session scratchpad) stubs `auth.uid()`, roles and the storage schema, runs the migration twice and checks the RLS/RPC scenarios. Docker isn't available on this machine (WSL feature off).
- UI: headless Chromium smoke tests via the browser-automation skill against `ng serve`.
- DB harnesses (scratchpad): `test.mjs <rebuild>` (97 checks) and `test2.mjs <rebuild> <organiser_accounts>` (48 checks: organiser login, moderator-only, guest regressions, data kept).
- E2E (2026-10-17, against the live Supabase project after the migration): two guests in separate browser contexts — check-in, duplicate name/email rejected, Who's Here no duplicates, photo + tag live, heart toggle, untag, note + tag, Then & Now + vote (no self-vote), Story hidden for guests, organiser code (wrong/right), Story preview, shortlist + ZIP, guest blocked from Facebook pack, organiser removes guest (all content gone, guest sent to welcome), leave & delete. 21/21 passed, 0 console errors. Test guests clean up after themselves (orphan anonymous auth users remain; harmless).
- `npx ng build` must be warning-free.

## Known limitations / ideas
- Anonymous identity lives in the browser; switching phone/clearing storage = new identity (an organiser can release the old name/email by removing the guest, which also deletes their posts).
- No offline/service worker yet; no image thumbnails (Supabase image transforms need a paid plan).
- Photos are public to anyone who has the exact (unguessable) URL.
