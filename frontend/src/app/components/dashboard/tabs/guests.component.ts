import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReunionService } from '../../../services/reunion.service';
import { SessionService } from '../../../services/session.service';
import { UiService } from '../../../services/ui.service';
import { Profile } from '../../../models/reunion.model';
import { friendlyError } from '../../../utils/errors';
import { initials } from '../../../utils/format';

@Component({
  selector: 'app-guests',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="space-y-4">
      <div class="flex items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-white">👥 Who's Here</h2>
          <p class="text-xs text-slate-400">Classmates who checked in tonight.</p>
        </div>
        <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-brakke-gold/15 text-brakke-gold border border-brakke-gold/30 shrink-0">
          {{ reunion.profiles().length }} checked in
        </span>
      </div>

      <input
        type="search"
        class="input"
        placeholder="Search classmates…"
        [ngModel]="query()"
        (ngModelChange)="query.set($event)"
        aria-label="Search classmates"
      />

      @if (reunion.loading() && !reunion.profiles().length) {
        <div class="py-16 flex flex-col items-center gap-3 text-slate-400 text-sm">
          <div class="spinner"></div>
          Loading guest list…
        </div>
      } @else {
        <ul class="space-y-2.5">
          @for (guest of visible(); track guest.id) {
            <li class="card p-3.5 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 shrink-0 rounded-full bg-brakke-surface border border-brakke-gold/40 flex items-center justify-center font-bold text-brakke-gold text-sm">
                  {{ initials(guest.display_name) }}
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-white truncate">{{ guest.display_name }}</p>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    @if (guest.is_organizer) {
                      <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-brakke-gold text-brakke-deep">Organiser</span>
                    }
                    @if (guest.id === session.userId()) {
                      <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-brakke-surface text-slate-300 border border-brakke-line">You</span>
                    }
                  </div>
                </div>
              </div>

              @if (session.isOrganizer() && guest.id !== session.userId()) {
                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-brakke-line bg-brakke-surface text-slate-200 hover:border-brakke-gold transition"
                    (click)="toggleOrganizer(guest)"
                  >
                    {{ guest.is_organizer ? 'Revoke organiser' : 'Make organiser' }}
                  </button>
                  <button type="button" class="btn-ghost-danger" (click)="remove(guest)" aria-label="Remove guest">🗑️</button>
                </div>
              }
            </li>
          } @empty {
            <li class="text-center text-sm text-slate-400 py-10">No classmates match "{{ query() }}".</li>
          }
        </ul>
      }
    </section>
  `
})
export class GuestsComponent {
  readonly reunion = inject(ReunionService);
  readonly session = inject(SessionService);
  private readonly ui = inject(UiService);

  readonly query = signal('');
  readonly initials = initials;

  readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.reunion
      .profiles()
      .filter((p) => !q || p.display_name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.is_organizer) - Number(a.is_organizer) || a.display_name.localeCompare(b.display_name));
  });

  async toggleOrganizer(guest: Profile): Promise<void> {
    const make = !guest.is_organizer;
    const ok = await this.ui.confirm({
      title: make ? `Make ${guest.display_name} an organiser?` : `Revoke organiser rights?`,
      message: make
        ? 'Organisers can delete any photo, note or guest, and export all data including emails.'
        : `${guest.display_name} will no longer be able to moderate.`,
      confirmLabel: make ? 'Make organiser' : 'Revoke'
    });
    if (!ok) return;
    try {
      await this.reunion.setOrganizer(guest, make);
      this.ui.success(make ? `${guest.display_name} is now an organiser.` : 'Organiser rights revoked.');
    } catch (err) {
      this.ui.error(friendlyError(err));
    }
  }

  async remove(guest: Profile): Promise<void> {
    const ok = await this.ui.confirm({
      title: `Remove ${guest.display_name}?`,
      message:
        'This removes them from Who\'s Here and permanently deletes everything they posted: photos, notes, Then & Now entry, hearts and votes.\n\nThey will be signed out, and their name becomes free to use again.',
      confirmLabel: 'Remove & delete all',
      danger: true
    });
    if (!ok) return;
    try {
      await this.reunion.removeGuest(guest);
      this.ui.success(`${guest.display_name} and their posts were removed.`);
    } catch (err) {
      this.ui.error(friendlyError(err));
    }
  }
}
