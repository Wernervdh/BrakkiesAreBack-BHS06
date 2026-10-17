import { Component, computed, inject, model, signal } from '@angular/core';
import { ReunionService } from '../../services/reunion.service';
import { SessionService } from '../../services/session.service';
import { MAX_TAGS } from '../../models/reunion.model';

/** Pick checked-in classmates to tag. Only guests with a profile can be tagged. */
@Component({
  selector: 'app-tag-picker',
  standalone: true,
  template: `
    <div>
      <label class="label" for="tagSearch">Tag classmates <span class="normal-case font-normal text-slate-400">(optional)</span></label>

      @if (selectedProfiles().length) {
        <div class="flex flex-wrap gap-1.5 mb-2">
          @for (p of selectedProfiles(); track p.id) {
            <button type="button" class="chip-on flex items-center gap-1" (click)="toggle(p.id)" [attr.aria-label]="'Remove tag ' + p.display_name">
              {{ p.display_name }} <span aria-hidden="true">✕</span>
            </button>
          }
        </div>
      }

      <input
        id="tagSearch"
        type="search"
        class="input"
        placeholder="Search checked-in classmates…"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        autocomplete="off"
      />

      @if (query().trim()) {
        <ul class="mt-2 max-h-48 overflow-y-auto rounded-xl border border-brakke-line divide-y divide-brakke-line">
          @for (p of matches(); track p.id) {
            <li>
              <button
                type="button"
                class="w-full text-left px-4 py-2.5 text-sm hover:bg-brakke-surface flex items-center justify-between"
                (click)="toggle(p.id); query.set('')"
                [disabled]="!selected().includes(p.id) && selected().length >= maxTags"
              >
                <span>{{ p.display_name }}</span>
                @if (selected().includes(p.id)) { <span class="text-brakke-gold">✓</span> }
              </button>
            </li>
          } @empty {
            <li class="px-4 py-3 text-xs text-slate-400">
              No checked-in classmate matches. Only people who checked in can be tagged.
            </li>
          }
        </ul>
      }
    </div>
  `
})
export class TagPickerComponent {
  private readonly reunion = inject(ReunionService);
  private readonly session = inject(SessionService);

  readonly selected = model<string[]>([]);
  readonly query = signal('');
  readonly maxTags = MAX_TAGS;

  private readonly others = computed(() =>
    this.reunion.guests().filter((p) => p.id !== this.session.userId())
  );

  readonly selectedProfiles = computed(() =>
    this.selected()
      .map((id) => this.reunion.profiles().find((p) => p.id === id))
      .filter((p) => !!p)
  );

  readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.others()
      .filter((p) => p.display_name.toLowerCase().includes(q))
      .slice(0, 8);
  });

  toggle(id: string): void {
    this.selected.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
}
