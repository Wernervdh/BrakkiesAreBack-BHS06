import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile } from '../models/reunion.model';
import { UserFacingError } from '../utils/errors';
import { normalizeDisplayName } from '../utils/format';

/**
 * Guest identity. Each device signs in anonymously with Supabase Auth; the guest's
 * profile row is keyed by that auth user id, so the database knows who owns what.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly supabase = inject(SupabaseService).client;

  readonly userId = signal<string | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly isOrganizer = computed(() => this.profile()?.is_organizer === true);
  /** Set when an organiser removed this guest, so the welcome page can explain why. */
  readonly removedNotice = signal(false);

  private initPromise: Promise<void> | null = null;

  init(): Promise<void> {
    this.initPromise ??= this.restore().catch((err) => {
      this.initPromise = null;
      throw err;
    });
    return this.initPromise;
  }

  private async restore(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    this.userId.set(data.session?.user.id ?? null);
    if (this.userId()) await this.refreshProfile();
  }

  async refreshProfile(): Promise<Profile | null> {
    const uid = this.userId();
    if (!uid) {
      this.profile.set(null);
      return null;
    }
    const { data, error } = await this.supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) throw error;
    this.profile.set(data as Profile | null);
    return data as Profile | null;
  }

  /**
   * Signs the device in (anonymously) and creates the guest profile.
   * The database keeps only a keyed fingerprint of the email to allow one check-in per email;
   * the address itself is never stored.
   */
  async checkIn(displayName: string, email: string): Promise<Profile> {
    if (!this.userId()) {
      const { data, error } = await this.supabase.auth.signInAnonymously();
      if (error || !data.user) throw error ?? new Error('Sign-in failed');
      this.userId.set(data.user.id);
    }

    const { data, error } = await this.supabase
      .rpc('check_in', { p_display_name: normalizeDisplayName(displayName), p_email: email.trim() })
      .single();
    if (error) {
      if (/already checked in/.test(error.message)) {
        throw new UserFacingError(
          'Someone with this name has already checked in. If that was you on another phone, ask an organiser to release your name, or add a middle name or nickname.'
        );
      }
      if (/already used to check in/.test(error.message)) {
        throw new UserFacingError(
          'This email address was already used to check in on another phone. If that was you, ask an organiser to release it.'
        );
      }
      throw error;
    }

    const profile = data as Profile;
    this.profile.set(profile);
    this.removedNotice.set(false);
    return profile;
  }

  async claimOrganizer(code: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('claim_organizer', { code });
    if (error) throw error;
    if (data === true) await this.refreshProfile();
    return data === true;
  }

  /**
   * Deletes this guest's profile (which cascades to all their posts) and signs the device out.
   * Delete the guest's storage files first (ReunionService.removeUserFiles).
   */
  async leave(): Promise<void> {
    const uid = this.userId();
    this.leaving = true;
    try {
      if (uid) {
        const { error } = await this.supabase.from('profiles').delete().eq('id', uid);
        if (error) throw error;
      }
      await this.supabase.auth.signOut();
      this.clear();
    } finally {
      this.leaving = false;
    }
  }

  private leaving = false;

  /** Called when this guest's profile was deleted (by an organiser). */
  handleRemoved(): void {
    if (this.leaving || !this.profile()) return;
    this.profile.set(null);
    this.removedNotice.set(true);
  }

  private clear(): void {
    this.userId.set(null);
    this.profile.set(null);
  }
}
