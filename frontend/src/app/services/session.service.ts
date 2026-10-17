import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile } from '../models/reunion.model';
import { UserFacingError } from '../utils/errors';
import { normalizeDisplayName } from '../utils/format';

/** Log out automatically after this long without any interaction. Posts are kept. */
export const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const LAST_ACTIVE_KEY = 'brakke_last_active';
const CHECK_EVERY_MS = 60 * 1000;

/** 4 easy-to-read characters, e.g. "7F3K", for organiser session names. */
function shortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => chars[b % chars.length]).join('');
}

/** Why the guest is back on the welcome page (shown there). */
export type SessionNotice = 'logged_out' | 'inactive' | 'signed_out' | 'removed' | 'organiser_logged_out' | null;

/**
 * Guest identity. Each browser signs in anonymously with Supabase Auth and the database links
 * that login to a profile (private.profile_sessions). Logging out unlinks it; checking in again
 * with the same name + email links a new login to the same profile, so nothing is lost.
 * One active login per profile: logging in on another phone logs this one out.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly supabase = inject(SupabaseService).client;

  readonly profile = signal<Profile | null>(null);
  /** The current profile id: owner of photos, notes, hearts and votes. */
  readonly userId = computed(() => this.profile()?.id ?? null);
  readonly isOrganizer = computed(() => this.profile()?.is_organizer === true);
  readonly notice = signal<SessionNotice>(null);

  private authUid: string | null = null;
  private initPromise: Promise<void> | null = null;
  private leaving = false;
  private lastWrite = 0;

  constructor() {
    if (typeof window === 'undefined') return;
    const touch = () => this.touch();
    for (const event of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
      window.addEventListener(event, touch, { passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      // Back from the background: check the idle time before counting this as activity.
      if (!this.expireIfIdle()) this.touch(true);
    });
    setInterval(() => {
      if (!this.profile() || this.expireIfIdle()) return;
      // Also notices "logged in on another phone" and removal by an organiser.
      void this.refreshProfile().catch(() => undefined);
    }, CHECK_EVERY_MS);
  }

  init(): Promise<void> {
    this.initPromise ??= this.restore().catch((err) => {
      this.initPromise = null;
      throw err;
    });
    return this.initPromise;
  }

  private async restore(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    this.authUid = data.session?.user.id ?? null;
    if (!this.authUid) return;
    if (this.isIdle()) {
      // Load the profile first so an organiser session is removed rather than just unlinked.
      await this.refreshProfile().catch(() => null);
      await this.logout('inactive');
      return;
    }
    this.touch(true);
    await this.refreshProfile();
  }

  async refreshProfile(): Promise<Profile | null> {
    if (!this.authUid) {
      this.profile.set(null);
      return null;
    }
    const { data, error } = await this.supabase.rpc('my_profile').maybeSingle();
    if (error) throw error;
    const profile = (data as Profile | null) ?? null;
    if (!profile && this.profile() && !this.leaving) this.notice.set('signed_out');
    this.profile.set(profile);
    return profile;
  }

  /**
   * Checks in a new guest, or logs a returning guest back in (same name + same email).
   * The database keeps only a keyed fingerprint of the email; the address itself is never stored.
   */
  async checkIn(displayName: string, email: string): Promise<Profile> {
    await this.ensureLogin();
    const { data, error } = await this.supabase
      .rpc('check_in', { p_display_name: normalizeDisplayName(displayName), p_email: email.trim() })
      .single();
    if (error) {
      if (/already checked in/.test(error.message)) {
        throw new UserFacingError('Someone with this name has already checked in. Add a middle name or nickname.');
      }
      throw error;
    }
    const profile = data as Profile | null;
    if (!profile?.id) {
      throw new UserFacingError(
        "This name has already checked in with a different email. If it's you, use the same email as before. " +
          "If you're someone else with the same name, add a middle name or nickname."
      );
    }
    return this.loggedIn(profile);
  }

  /**
   * Organiser (moderator) login with only the organiser code. Each login gets its own
   * organiser session named e.g. "Organiser 7F3K"; logging out removes it again.
   * Organiser accounts can view and delete, but never post, heart or vote.
   */
  async organizerLogin(code: string): Promise<Profile> {
    await this.ensureLogin();
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await this.supabase
        .rpc('organizer_login', { p_display_name: `Organiser ${shortCode()}`, p_code: code })
        .single();
      if (error) {
        if (/already checked in/.test(error.message)) continue; // name clash: try another suffix
        throw error;
      }
      const profile = data as Profile | null;
      if (!profile?.id) throw new UserFacingError('That organiser code is not correct.');
      return this.loggedIn(profile);
    }
    throw new UserFacingError('Could not log in. Please try again.');
  }

  /**
   * Logs this device out. Guests keep their photos, notes, hearts and votes (checking in again
   * restores them). Organiser sessions have nothing to keep, so they are removed.
   */
  async logout(reason: Exclude<SessionNotice, null> = 'logged_out'): Promise<void> {
    const organiserId = this.isOrganizer() ? this.userId() : null;
    this.leaving = true;
    try {
      if (organiserId) {
        await this.supabase.from('profiles').delete().eq('id', organiserId);
      } else {
        await this.supabase.rpc('end_session');
      }
      await this.supabase.auth.signOut();
    } finally {
      this.leaving = false;
      this.clear();
      this.notice.set(organiserId ? 'organiser_logged_out' : reason);
    }
  }

  /**
   * Deletes this guest's profile (which cascades to all their posts) and signs the device out.
   * Delete the guest's storage files first (ReunionService.removeUserFiles).
   */
  async leave(): Promise<void> {
    const id = this.userId();
    this.leaving = true;
    try {
      if (id) {
        const { error } = await this.supabase.from('profiles').delete().eq('id', id);
        if (error) throw error;
      }
      await this.supabase.auth.signOut();
      this.clear();
      this.notice.set(null);
    } finally {
      this.leaving = false;
    }
  }

  /** Called when this guest's profile was deleted (by an organiser). */
  handleRemoved(): void {
    if (this.leaving || !this.profile()) return;
    this.profile.set(null);
    this.notice.set('removed');
  }

  private async ensureLogin(): Promise<void> {
    if (this.authUid) return;
    const { data, error } = await this.supabase.auth.signInAnonymously();
    if (error || !data.user) throw error ?? new Error('Sign-in failed');
    this.authUid = data.user.id;
  }

  private loggedIn(profile: Profile): Profile {
    this.profile.set(profile);
    this.notice.set(null);
    this.touch(true);
    return profile;
  }

  private clear(): void {
    this.authUid = null;
    this.profile.set(null);
  }

  // ---------------------------------------------------------------------------
  // Inactivity (stored per browser so closing the tab counts as inactive time)
  // ---------------------------------------------------------------------------

  private touch(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastWrite < 15_000) return;
    this.lastWrite = now;
    try {
      localStorage.setItem(LAST_ACTIVE_KEY, String(now));
    } catch {
      // Storage unavailable (private mode): fall back to the in-memory timestamp.
    }
  }

  private lastActive(): number {
    try {
      const value = Number(localStorage.getItem(LAST_ACTIVE_KEY));
      if (value) return Math.max(value, this.lastWrite);
    } catch {
      // Storage unavailable.
    }
    return this.lastWrite || Date.now();
  }

  private isIdle(): boolean {
    return Date.now() - this.lastActive() > INACTIVITY_LIMIT_MS;
  }

  /** Logs out when idle for too long. Returns true when it did. */
  private expireIfIdle(): boolean {
    if (!this.profile() || !this.isIdle()) return false;
    void this.logout('inactive').catch(() => undefined);
    return true;
  }
}
