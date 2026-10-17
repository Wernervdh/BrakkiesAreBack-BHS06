import { Component, computed, inject, signal } from '@angular/core';
import { ReunionService } from '../../../services/reunion.service';
import { SessionService } from '../../../services/session.service';
import { UiService } from '../../../services/ui.service';
import { ThenNowEntry } from '../../../models/reunion.model';
import { friendlyError } from '../../../utils/errors';
import { ThenNowModalComponent } from '../../modals/then-now-modal.component';

@Component({
  selector: 'app-then-now',
  standalone: true,
  imports: [ThenNowModalComponent],
  template: `
    <section class="space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-white">🎭 Then &amp; Now</h2>
          <p class="text-xs text-slate-400">2006 matric photo vs 2026. Vote for "Most Changed"!</p>
        </div>
        @if (!hasMine()) {
          <button type="button" class="btn-primary px-3 py-2 text-xs shrink-0" (click)="adding.set(true)">➕ Add mine</button>
        }
      </div>

      @if (reunion.loading() && !reunion.thenNow().length) {
        <div class="py-16 flex flex-col items-center gap-3 text-slate-400 text-sm">
          <div class="spinner"></div>
          Loading…
        </div>
      } @else if (!reunion.thenNow().length) {
        <div class="card py-14 px-6 text-center">
          <p class="text-4xl mb-2">🎓</p>
          <p class="font-bold text-white">No comparisons yet</p>
          <p class="text-sm text-slate-400 mt-1 mb-5">Dig up your matric photo and take a selfie now!</p>
          <button type="button" class="btn-primary" (click)="adding.set(true)">Add my Then &amp; Now</button>
        </div>
      } @else {
        <div class="space-y-4">
          @for (entry of reunion.thenNow(); track entry.id; let i = $index) {
            <article class="card p-4">
              <div class="flex items-center justify-between gap-2 mb-3">
                <h3 class="font-bold text-white truncate">
                  {{ medal(i, entry) }} {{ entry.author_name }}
                  @if (isMine(entry)) { <span class="text-[10px] font-bold text-brakke-gold ml-1">YOU</span> }
                </h3>
                <span class="px-3 py-1 rounded-full bg-brakke-gold/15 text-brakke-gold border border-brakke-gold/30 text-xs font-bold tabular-nums shrink-0">
                  🔥 {{ entry.votes_count }} {{ entry.votes_count === 1 ? 'vote' : 'votes' }}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2 mb-3">
                <figure class="relative rounded-xl overflow-hidden aspect-square bg-black/50 border border-brakke-line">
                  <img [src]="entry.then_url" alt="2006" class="w-full h-full object-cover" loading="lazy" />
                  <figcaption class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-bold text-slate-200">2006</figcaption>
                </figure>
                <figure class="relative rounded-xl overflow-hidden aspect-square bg-black/50 border border-brakke-gold/40">
                  <img [src]="entry.now_url" alt="2026" class="w-full h-full object-cover" loading="lazy" />
                  <figcaption class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-brakke-gold text-[10px] font-black text-brakke-deep">2026</figcaption>
                </figure>
              </div>

              <div class="flex items-center gap-2">
                @if (isMine(entry)) {
                  <p class="flex-1 text-center text-xs text-slate-400 py-3">This is your entry. Others can vote for it.</p>
                } @else {
                  <button
                    type="button"
                    class="flex-1 btn border"
                    [class]="voted(entry)
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-brakke-surface border-brakke-line text-slate-200 hover:border-brakke-gold'"
                    (click)="vote(entry)"
                    [attr.aria-pressed]="voted(entry)"
                  >
                    {{ voted(entry) ? '✓ Voted Most Changed (tap to undo)' : '⚡ Vote Most Changed' }}
                  </button>
                }
                @if (isMine(entry) || session.isOrganizer()) {
                  <button type="button" class="btn-ghost-danger py-3 px-3" (click)="remove(entry)" aria-label="Delete entry">🗑️</button>
                }
              </div>
            </article>
          }
        </div>
      }
    </section>

    @if (adding()) {
      <app-then-now-modal (closed)="adding.set(false)" />
    }
  `
})
export class ThenNowComponent {
  readonly reunion = inject(ReunionService);
  readonly session = inject(SessionService);
  private readonly ui = inject(UiService);

  readonly adding = signal(false);
  readonly hasMine = computed(() => this.reunion.thenNow().some((e) => e.owner_id === this.session.userId()));

  isMine(entry: ThenNowEntry): boolean {
    return entry.owner_id === this.session.userId();
  }

  voted(entry: ThenNowEntry): boolean {
    return this.reunion.votedEntryIds().has(entry.id);
  }

  medal(index: number, entry: ThenNowEntry): string {
    if (entry.votes_count === 0) return '🎓';
    return ['🥇', '🥈', '🥉'][index] ?? '🎓';
  }

  async vote(entry: ThenNowEntry): Promise<void> {
    try {
      await this.reunion.toggleVote(entry);
    } catch (err) {
      this.ui.error(friendlyError(err));
    }
  }

  async remove(entry: ThenNowEntry): Promise<void> {
    const ok = await this.ui.confirm({
      title: 'Delete this Then & Now entry?',
      message: this.isMine(entry) ? 'Your entry and its votes will be removed.' : `Remove the entry of ${entry.author_name}?`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    try {
      await this.reunion.deleteThenNow(entry);
      this.ui.success('Entry deleted.');
    } catch (err) {
      this.ui.error(friendlyError(err));
    }
  }
}
