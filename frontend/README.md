# BrakkeBack BHS '06 - Frontend Setup (Angular)

Mobile-first web application for the **Matrix 2006 • 20 Jaar Reünie (Brackenfell High)**.

## Features
- **Zero-Friction Access (`/welcome`):** Scan venue QR code, enter display name, start participating immediately with `localStorage` guest session persistence.
- **Paparazzi Feed (`/feed` - Tab 1):** Real-time venue photo wall with camera capture, prompt tags (`#Mid-laugh`, `#Then & Now`, `#Unchanged`), and live like counters.
- **Time Capsule Wall (`/feed` - Tab 2):** Floating message wall categorized by `thank_you`, `memory`, and `prediction_30th` with quick FAB composer.
- **Then & Now Face Matcher (`/feed` - Tab 3):** Side-by-side 2006 matric photo vs 2026 reunion selfie with interactive voting.
- **Supabase Realtime WebSockets:** Instant live synchronization across all smartphones at the venue without page refreshes.

## Development Setup

1. **Install Dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Configure Supabase Credentials:**
   Edit `src/environments/environment.ts` with your Supabase project URL and anon public key:
   ```typescript
   export const environment = {
     production: false,
     supabaseUrl: 'https://your-project-id.supabase.co',
     supabaseAnonKey: 'your-anon-key'
   };
   ```

3. **Run Dev Server:**
   ```bash
   npm start
   # or
   npx ng serve
   ```
   Open `http://localhost:4200` in your mobile device emulator or browser.

4. **Production Build:**
   ```bash
   npm run build
   ```
   Build output will be generated inside `dist/brakkeback-bhs06`.
