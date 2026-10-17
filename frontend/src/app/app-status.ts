/**
 * Production on/off switch.
 * true  → every page shows the "closed" screen; the app makes no Supabase calls (all data is kept).
 * false → the reunion app runs normally.
 * Change it, build and push to main to close / reopen the live site.
 */
export const APP_CLOSED = true;
