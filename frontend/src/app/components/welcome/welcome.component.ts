import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../services/session.service';
import { CrestComponent } from '../shared/crest.component';
import { friendlyError } from '../../utils/errors';
import { isValidEmail, isValidFullName, normalizeDisplayName } from '../../utils/format';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [FormsModule, RouterLink, CrestComponent],
  template: `
    <div class="relative min-h-dvh flex flex-col items-center px-5 py-8 overflow-hidden">
      <div class="absolute inset-0 crest-stripes pointer-events-none"></div>
      <div class="absolute -top-24 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] bg-brakke-gold/10 rounded-full blur-3xl pointer-events-none"></div>

      <header class="relative w-full max-w-md text-center flex flex-col items-center pt-4">
        <app-crest [size]="112" />
        <h1 class="mt-5 text-3xl font-extrabold tracking-tight text-white">
          '06 <span class="text-brakke-gold">BrakkiesAreBack</span>
        </h1>
        <p class="mt-1 text-slate-300 font-medium">Matric 2006 • 20-Year Reunion</p>
        <p class="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-brakke-red/15 text-red-200 border border-brakke-red/40">
          Brackenfell High School
        </p>
      </header>

      <main class="relative w-full max-w-md my-auto py-8">
        @if (session.removedNotice()) {
          <div class="mb-4 p-3 rounded-xl text-sm bg-brakke-gold/10 border border-brakke-gold/30 text-brakke-goldLight">
            You were signed out by an organiser. You can check in again below.
          </div>
        }

        <section class="card p-6 backdrop-blur-xl">
          <h2 class="text-xl font-bold text-white">Welcome back, Brakkie!</h2>
          <p class="text-slate-300 text-sm mt-1 mb-6">
            Check in to share photos, write in the time capsule and vote in Then &amp; Now.
          </p>

          <form (ngSubmit)="submit()" class="space-y-4" novalidate>
            <div>
              <label for="displayName" class="label">Name &amp; surname</label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                class="input"
                [(ngModel)]="displayName"
                placeholder="e.g. Dirk van der Merwe"
                autocomplete="name"
                autocapitalize="words"
                maxlength="60"
                required
              />
            </div>

            <div>
              <label for="email" class="label">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                class="input"
                [(ngModel)]="email"
                placeholder="you@example.com"
                autocomplete="email"
                inputmode="email"
                autocapitalize="off"
                maxlength="254"
                required
              />
              <p class="mt-2 flex gap-2 text-xs leading-relaxed text-slate-300 bg-brakke-surface/70 border border-brakke-line rounded-xl p-3">
                <span aria-hidden="true">🔒</span>
                <span>
                  Your email is only used to make sure each classmate checks in once.
                  We don't save the address itself, only a scrambled code that can't be turned back into it.
                  Nobody can see it (not even the organisers), and we never send you anything.
                </span>
              </p>
            </div>

            <label class="flex items-start gap-3 text-xs text-slate-300 leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                name="consent"
                [(ngModel)]="consent"
                class="mt-0.5 w-5 h-5 shrink-0 rounded accent-brakke-gold"
              />
              <span>
                I understand that photos and notes I post are visible to everyone at the reunion, and that the
                organisers may share them (for example in the class Facebook group).
                <a routerLink="/about" class="text-brakke-gold underline underline-offset-2">Read more</a>
              </span>
            </label>

            @if (errorMessage()) {
              <div role="alert" class="p-3 bg-brakke-red/15 border border-brakke-red/40 rounded-xl text-red-200 text-sm">
                {{ errorMessage() }}
              </div>
            }

            <button type="submit" class="btn-primary w-full py-4 text-base" [disabled]="loading()">
              @if (loading()) {
                <span class="w-5 h-5 border-2 border-brakke-deep border-t-transparent rounded-full animate-spin"></span>
                Checking in…
              } @else {
                Enter the reunion
              }
            </button>
          </form>
        </section>
      </main>

      <footer class="relative w-full max-w-md text-center text-xs text-slate-400 space-y-2">
        <a routerLink="/about" class="inline-block font-semibold text-brakke-gold hover:underline">About this app &amp; how it works</a>
        <p>No app download or password needed.</p>
      </footer>
    </div>
  `
})
export class WelcomeComponent {
  readonly session = inject(SessionService);
  private readonly router = inject(Router);

  displayName = '';
  email = '';
  consent = false;
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  async submit(): Promise<void> {
    const name = normalizeDisplayName(this.displayName);
    const email = this.email.trim();

    if (!isValidFullName(name)) {
      this.errorMessage.set('Please enter your first name and surname (e.g. Dirk van der Merwe).');
      return;
    }
    if (!isValidEmail(email)) {
      this.errorMessage.set(email ? 'That email address does not look right.' : 'Please enter your email address.');
      return;
    }
    if (!this.consent) {
      this.errorMessage.set('Please tick the box to confirm you understand how photos are shared.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    try {
      await this.session.checkIn(name, email);
      await this.router.navigate(['/feed']);
    } catch (err) {
      this.errorMessage.set(friendlyError(err, 'Could not check you in. Please try again.'));
    } finally {
      this.loading.set(false);
    }
  }
}
