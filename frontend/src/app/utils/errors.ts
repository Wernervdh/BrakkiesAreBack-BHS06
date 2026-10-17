/** Messages raised on purpose by the database (see the migration) are safe to show as-is. */
const DB_MESSAGES = [
  'Please check in before posting.',
  'Please check in first.',
  'You are posting very fast. Please wait a few minutes.',
  'Too many attempts. Please try again later.',
  'You cannot remove your own organiser rights.',
  'Only organisers can do this.',
  'Please enter a valid email address.',
  'Please enter your name and surname (3 to 60 characters).',
  'Please enter a name of 3 to 60 characters.',
  'Organisers can only moderate, not post.',
  'This email address was already used with a different name. Use the exact name you checked in with.',
  'This phone is checked in as a guest. Use another browser or phone for the organiser login.'
];

/** Turns Supabase / network / validation errors into a short message for guests. */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof UserFacingError) return err.message;

  const e = err as { message?: string; code?: string; statusCode?: string | number } | null;
  const message = e?.message ?? '';

  const known = DB_MESSAGES.find((m) => message.includes(m));
  if (known) return known;

  if (/anonymous sign-ins are disabled/i.test(message)) {
    return 'Check-in is not open yet. The organisers are still setting up the app.';
  }
  if (/rate limit|too many requests/i.test(message) || e?.statusCode === 429 || e?.statusCode === '429') {
    return 'Lots of people are checking in right now. Please wait a minute and try again.';
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Network problem. Check your connection and try again.';
  }
  if (/payload too large|exceeded the maximum allowed size/i.test(message)) {
    return 'That photo is too large. Please choose a smaller one.';
  }
  if (/mime type|invalid_mime_type/i.test(message)) {
    return 'Please choose a JPG, PNG or WebP photo.';
  }
  if (e?.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'You do not have permission to do that.';
  }
  return fallback;
}

/** An error whose message is written for guests. */
export class UserFacingError extends Error {}
