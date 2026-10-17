import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex flex-col justify-between items-center p-6 bg-gradient-to-b from-[#070f1e] via-[#0a192f] to-[#070f1e]">
      <!-- Background Ambient Glow -->
      <div class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-brakke-gold/10 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Header / Crest section -->
      <div class="w-full max-w-md pt-8 text-center flex flex-col items-center z-10">
        <div class="w-20 h-20 mb-4 rounded-2xl bg-gradient-to-br from-brakke-gold to-brakke-goldDark p-[2px] shadow-lg shadow-brakke-gold/20 flex items-center justify-center">
          <div class="w-full h-full bg-[#0a192f] rounded-2xl flex flex-col items-center justify-center">
            <span class="text-2xl font-black text-brakke-gold tracking-tight">BHS</span>
            <span class="text-xs text-slate-400 font-semibold tracking-widest uppercase">'06</span>
          </div>
        </div>

        <h1 class="text-3xl font-extrabold tracking-tight text-white mb-2">
          '06 <span class="text-brakke-gold">BrakkiesAreBack</span> BHS
        </h1>
        <p class="text-slate-300 font-medium text-sm sm:text-base">
          Matric 2006 • 20-Year Reunion
        </p>
        <div class="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brakke-gold/15 text-brakke-goldLight border border-brakke-gold/30">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Brackenfell High School
        </div>
      </div>

      <!-- Input Form Card -->
      <div class="w-full max-w-md my-auto py-6 z-10">
        <div class="bg-[#112240]/80 backdrop-blur-xl border border-brakke-gold/20 rounded-3xl p-6 shadow-2xl shadow-black/60">
          <h2 class="text-xl font-bold text-white mb-1">Welcome to the Reunion!</h2>
          <p class="text-slate-300 text-xs mb-6">
            Enter your name & surname to share photos, vote in Face Matcher, and leave messages on the wall.
          </p>

          <form (ngSubmit)="enterReunion()" class="space-y-4">
            <div>
              <label for="displayName" class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Name & Surname *
              </label>
              <input
                id="displayName"
                type="text"
                [(ngModel)]="displayName"
                name="displayName"
                required
                placeholder="e.g. Dirk van der Merwe"
                class="w-full px-4 py-3.5 bg-[#0a192f] border border-slate-700/80 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brakke-gold focus:border-transparent transition text-base"
                autocomplete="name"
              />
              <p class="text-[11px] text-slate-400 mt-1">Please provide both your first name and surname.</p>
            </div>

            @if (errorMessage()) {
              <div class="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>{{ errorMessage() }}</span>
              </div>
            }

            <button
              type="submit"
              [disabled]="loading() || !displayName.trim()"
              class="w-full py-4 mt-2 px-6 rounded-2xl font-bold text-base bg-gradient-to-r from-brakke-gold via-amber-400 to-brakke-goldDark text-slate-950 shadow-lg shadow-brakke-gold/20 hover:shadow-brakke-gold/40 hover:brightness-105 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 flex items-center justify-center gap-2"
            >
              @if (loading()) {
                <span class="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                <span>Entering...</span>
              } @else {
                <span>Enter the Reunion 🚀</span>
              }
            </button>
          </form>
        </div>
      </div>

      <!-- Similarity / Confirmation Modal -->
      @if (showConfirmModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div class="w-full max-w-sm bg-[#112240] border border-brakke-gold/40 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div class="w-12 h-12 rounded-2xl bg-brakke-gold/20 text-brakke-gold flex items-center justify-center text-2xl mx-auto">
              🤔
            </div>
            <div>
              <h3 class="text-base font-bold text-white mb-1">
                Are you sure this is what you signed in with earlier?
              </h3>
              <p class="text-xs text-slate-300 leading-relaxed">
                We found an existing classmate with a very similar name:
              </p>
              <div class="mt-2 p-2.5 rounded-xl bg-[#0a192f] border border-slate-700/80 font-bold text-brakke-gold text-sm">
                "{{ similarProfileName() }}"
              </div>
              <p class="text-[11px] text-slate-400 mt-2">
                Did you mean to sign in as <strong>"{{ similarProfileName() }}"</strong>, or is <strong>"{{ pendingName() }}"</strong> a different classmate?
              </p>
            </div>

            <div class="space-y-2 pt-2">
              <button
                type="button"
                (click)="confirmUseExistingName()"
                class="w-full py-3 px-4 rounded-xl font-bold text-xs bg-brakke-gold text-slate-950 hover:brightness-105 transition"
              >
                Yes, sign in as "{{ similarProfileName() }}"
              </button>
              <button
                type="button"
                (click)="confirmProceedWithNewName()"
                class="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-slate-800 text-slate-300 hover:text-white transition"
              >
                No, keep "{{ pendingName() }}" (New)
              </button>
              <button
                type="button"
                (click)="cancelModal()"
                class="w-full py-2 text-[11px] text-slate-400 hover:text-slate-200 transition"
              >
                Cancel & Edit
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Footer Info -->
      <div class="w-full max-w-md pb-6 text-center text-xs text-slate-400 z-10">
        <p>Zero-friction QR access • Matric 2006 (2006–2026)</p>
      </div>
    </div>
  `
})
export class WelcomeComponent {
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);

  displayName = '';
  loading = signal(false);
  errorMessage = signal('');

  // Confirmation modal state for fuzzy match
  showConfirmModal = signal(false);
  pendingName = signal('');
  similarProfileName = signal('');

  constructor() {
    const existing = this.supabaseService.getStoredUserName();
    if (existing) {
      this.displayName = existing;
    }
  }

  async enterReunion(): Promise<void> {
    const trimmed = this.displayName.trim();
    if (!trimmed) {
      this.errorMessage.set('Please enter your name & surname.');
      return;
    }

    // Check special admin exemption
    const isSpecialAdmin = trimmed.toLowerCase() === '06brakkieadmin';

    // Validate name and surname requirement (at least 2 words of at least 2 chars each)
    if (!isSpecialAdmin) {
      const parts = trimmed.split(/\s+/).filter((p) => p.length > 0);
      if (parts.length < 2 || parts[0].length < 2 || parts[1].length < 2) {
        this.errorMessage.set(
          'Please enter both your first name and surname (e.g. Dirk van der Merwe).'
        );
        return;
      }
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      // Fetch existing profiles to check uniqueness & fuzzy similarity
      const profiles = await this.supabaseService.getProfiles();

      if (!isSpecialAdmin) {
        // 1. Exact match (case-insensitive) -> returning user signing back in with identical name
        const exactMatch = profiles.find(
          (p) => p.display_name.trim().toLowerCase() === trimmed.toLowerCase()
        );

        if (!exactMatch) {
          // 2. Fuzzy match detection: check if there is an existing profile that is very close
          const similar = this.findSimilarProfile(trimmed, profiles);
          if (similar) {
            this.pendingName.set(trimmed);
            this.similarProfileName.set(similar.display_name);
            this.showConfirmModal.set(true);
            this.loading.set(false);
            return;
          }
        }
      }

      await this.finalizeLogin(trimmed);
    } catch (err) {
      console.error(err);
      await this.finalizeLogin(trimmed);
    } finally {
      this.loading.set(false);
    }
  }

  async confirmUseExistingName(): Promise<void> {
    const nameToUse = this.similarProfileName();
    this.showConfirmModal.set(false);
    this.loading.set(true);
    await this.finalizeLogin(nameToUse);
    this.loading.set(false);
  }

  async confirmProceedWithNewName(): Promise<void> {
    const nameToUse = this.pendingName();
    this.showConfirmModal.set(false);
    this.loading.set(true);
    await this.finalizeLogin(nameToUse);
    this.loading.set(false);
  }

  cancelModal(): void {
    this.showConfirmModal.set(false);
    this.loading.set(false);
  }

  private async finalizeLogin(finalName: string): Promise<void> {
    this.supabaseService.setStoredUserName(finalName.trim());
    try {
      await this.supabaseService.registerProfile(finalName.trim());
    } catch (err) {
      console.error('Registration warning:', err);
    }
    this.router.navigate(['/feed']);
  }

  /**
   * Levenshtein Distance & Token Jaccard check to detect slightly different spellings
   */
  private findSimilarProfile(input: string, profiles: any[]): any | null {
    const cleanInput = this.normalizeName(input);
    const inputTokens = cleanInput.split(' ').filter(Boolean);

    for (const p of profiles) {
      if (!p.display_name) continue;
      if (p.display_name.toLowerCase() === '06brakkieadmin') continue;

      const cleanTarget = this.normalizeName(p.display_name);
      if (cleanTarget === cleanInput) continue; // exact matches handled separately

      // Check edit distance
      const distance = this.levenshteinDistance(cleanInput, cleanTarget);
      const maxLen = Math.max(cleanInput.length, cleanTarget.length);
      const similarity = 1 - distance / maxLen;

      // Check word token overlap (e.g. "Dirk van der Merwe" vs "Dirk v.d. Merwe" or "Dirk v d Merwe")
      const targetTokens = cleanTarget.split(' ').filter(Boolean);
      const common = inputTokens.filter((t) => targetTokens.includes(t));
      const tokenOverlap = common.length / Math.max(inputTokens.length, targetTokens.length);

      if (similarity >= 0.78 || (tokenOverlap >= 0.66 && distance <= 4)) {
        return p;
      }
    }
    return null;
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }
}
