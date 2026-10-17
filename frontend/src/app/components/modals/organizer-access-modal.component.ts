import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../services/session.service';
import { UiService } from '../../services/ui.service';
import { friendlyError } from '../../utils/errors';

@Component({
  selector: 'app-organizer-access-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="sheet-backdrop" (click)="closed.emit()">
      <div class="sheet" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="orgTitle">
        <h3 id="orgTitle" class="text-lg font-bold text-white">🔑 Organiser access</h3>
        <p class="text-sm text-slate-400 mt-1">
          Committee members: enter the organiser code you received to unlock moderation and export tools.
        </p>
        <form (ngSubmit)="submit()" class="mt-4 space-y-4">
          <input
            name="code"
            type="password"
            class="input"
            [(ngModel)]="code"
            placeholder="Organiser code"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          @if (errorMessage()) {
            <div role="alert" class="p-3 bg-brakke-red/15 border border-brakke-red/40 rounded-xl text-red-200 text-sm">{{ errorMessage() }}</div>
          }
          <div class="flex gap-3">
            <button type="button" class="btn-secondary flex-1" (click)="closed.emit()">Cancel</button>
            <button type="submit" class="btn-primary flex-1" [disabled]="busy() || !code.trim()">
              {{ busy() ? 'Checking…' : 'Unlock' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class OrganizerAccessModalComponent {
  private readonly session = inject(SessionService);
  private readonly ui = inject(UiService);

  readonly closed = output<void>();
  readonly busy = signal(false);
  readonly errorMessage = signal('');
  code = '';

  async submit(): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set('');
    try {
      const ok = await this.session.claimOrganizer(this.code.trim());
      if (ok) {
        this.ui.success('You are now an organiser. 🛡️');
        this.closed.emit();
      } else {
        this.errorMessage.set('That code is not correct.');
      }
    } catch (err) {
      this.errorMessage.set(friendlyError(err));
    } finally {
      this.busy.set(false);
      this.code = '';
    }
  }
}
