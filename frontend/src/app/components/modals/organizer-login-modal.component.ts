import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../../services/session.service';
import { UiService } from '../../services/ui.service';
import { friendlyError } from '../../utils/errors';

/** Organiser (moderator) login from the welcome page: only the organiser code. */
@Component({
  selector: 'app-organizer-login-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="sheet-backdrop" (click)="close()">
      <div class="sheet" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="orgLoginTitle">
        <div class="flex items-start justify-between pb-4 border-b border-brakke-line">
          <div>
            <h3 id="orgLoginTitle" class="text-lg font-bold text-white">🛡️ Organiser login</h3>
            <p class="text-xs text-slate-400">For the reunion committee only.</p>
          </div>
          <button type="button" class="btn-secondary w-9 h-9 p-0" (click)="close()" aria-label="Close">✕</button>
        </div>

        <p class="mt-4 text-sm text-slate-300 leading-relaxed">
          Organisers can view everything and remove photos, notes or guests that aren't appropriate. They can't post,
          heart or vote. Want to join in as yourself too? Check in as a guest on another phone or browser.
        </p>

        <form (ngSubmit)="submit()" class="mt-4 space-y-4" novalidate>
          <div>
            <label for="orgCode" class="label">Organiser or super admin code</label>
            <input
              id="orgCode"
              name="code"
              type="password"
              class="input"
              [(ngModel)]="code"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              autofocus
            />
          </div>

          @if (errorMessage()) {
            <div role="alert" class="p-3 bg-brakke-red/15 border border-brakke-red/40 rounded-xl text-red-200 text-sm">{{ errorMessage() }}</div>
          }

          <div class="flex gap-3">
            <button type="button" class="btn-secondary flex-1" (click)="close()">Cancel</button>
            <button type="submit" class="btn-primary flex-1" [disabled]="busy()">
              {{ busy() ? 'Checking…' : 'Log in' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class OrganizerLoginModalComponent {
  private readonly session = inject(SessionService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  readonly closed = output<void>();
  readonly busy = signal(false);
  readonly errorMessage = signal('');
  code = '';

  close(): void {
    if (!this.busy()) this.closed.emit();
  }

  async submit(): Promise<void> {
    if (!this.code.trim()) {
      this.errorMessage.set('Please enter the organiser code.');
      return;
    }
    this.busy.set(true);
    this.errorMessage.set('');
    try {
      await this.session.organizerLogin(this.code.trim());
      this.closed.emit();
      await this.router.navigate(['/feed']);
      this.ui.success(this.session.isSuperAdmin() ? 'Logged in as super admin. 🛡️' : 'Logged in as organiser. 🛡️');
    } catch (err) {
      this.errorMessage.set(friendlyError(err, 'Could not log in. Please try again.'));
    } finally {
      this.busy.set(false);
      this.code = '';
    }
  }
}
