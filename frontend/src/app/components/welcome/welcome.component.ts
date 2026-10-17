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
            Enter your name to share photos, vote in Face Matcher, and leave messages on the wall.
          </p>

          <form (ngSubmit)="enterReunion()" class="space-y-4">
            <div>
              <label for="displayName" class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                First & Last Name (or Nickname) *
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
            </div>

            <div>
              <label for="email" class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Optional Email <span class="text-slate-400 font-normal lowercase">(for post-event photo digest)</span>
              </label>
              <input
                id="email"
                type="email"
                [(ngModel)]="email"
                name="email"
                placeholder="name@example.com"
                class="w-full px-4 py-3 bg-[#0a192f] border border-slate-700/80 rounded-2xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brakke-gold focus:border-transparent transition text-sm"
                autocomplete="email"
              />
            </div>

            @if (errorMessage()) {
              <div class="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
                {{ errorMessage() }}
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
  email = '';
  loading = signal(false);
  errorMessage = signal('');

  constructor() {
    const existing = this.supabaseService.getStoredUserName();
    if (existing) {
      this.displayName = existing;
    }
  }

  async enterReunion(): Promise<void> {
    if (!this.displayName.trim()) {
      this.errorMessage.set('Please enter your name.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      this.supabaseService.setStoredUserName(this.displayName.trim());
      await this.supabaseService.registerProfile(this.displayName.trim(), this.email.trim());
      this.router.navigate(['/feed']);
    } catch (err) {
      console.error(err);
      // Still allow zero friction redirect even if Supabase is offline
      this.router.navigate(['/feed']);
    } finally {
      this.loading.set(false);
    }
  }
}
