import { Component, computed, inject, model, signal } from '@angular/core';
import { ReunionService } from '../../services/reunion.service';
import { SessionService } from '../../services/session.service';
import { MAX_TAGS, Profile } from '../../models/reunion.model';

interface Suggestion {
  profile: Profile;
  /** Name split around the matched text, for highlighting. */
  before: string;
  match: string;
  after: string;
}

const MAX_SUGGESTIONS = 8;

/**
 * Predictive picker for tagging checked-in classmates. Suggestions show on focus; typing ranks
 * names where a word starts with the text first ("W" → "Werner", "van der Walt"), then other matches.
 */
@Component({
  selector: 'app-tag-picker',
  standalone: true,
  template: `
    <div class="relative">
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
        placeholder="Start typing a name…"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="tagSuggestions"
        [attr.aria-expanded]="open()"
        [attr.aria-activedescendant]="open() && suggestions().length ? 'tag-opt-' + active() : null"
        [value]="query()"
        (input)="onInput($any($event.target).value)"
        (focus)="open.set(true)"
        (blur)="open.set(false)"
        (keydown)="onKeydown($event)"
        autocomplete="off"
        autocapitalize="words"
      />

      @if (open()) {
        <ul
          id="tagSuggestions"
          role="listbox"
          class="mt-2 max-h-56 overflow-y-auto rounded-xl border border-brakke-line bg-brakke-navy divide-y divide-brakke-line"
        >
          @for (s of suggestions(); track s.profile.id; let i = $index) {
            <li role="option" [id]="'tag-opt-' + i" [attr.aria-selected]="i === active()">
              <button
                type="button"
                tabindex="-1"
                class="w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-2 transition"
                [class]="i === active() ? 'bg-brakke-surface' : 'hover:bg-brakke-surface'"
                (mousedown)="$event.preventDefault()"
                (mouseenter)="active.set(i)"
                (click)="pick(s.profile)"
                [disabled]="!isSelected(s.profile.id) && full()"
              >
                <span class="truncate">{{ s.before }}<strong class="text-brakke-gold">{{ s.match }}</strong>{{ s.after }}</span>
                @if (isSelected(s.profile.id)) { <span class="text-brakke-gold shrink-0">✓</span> }
              </button>
            </li>
          } @empty {
            <li class="px-4 py-3 text-xs text-slate-400">
              @if (query().trim()) {
                No checked-in classmate matches. Only people who checked in can be tagged.
              } @else {
                Nobody else has checked in yet.
              }
            </li>
          }
          @if (moreCount()) {
            <li class="px-4 py-2 text-[11px] text-slate-500">+{{ moreCount() }} more, keep typing to narrow down</li>
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
  readonly open = signal(false);
  readonly active = signal(0);

  private readonly candidates = computed(() =>
    this.reunion
      .guests()
      .filter((p) => p.id !== this.session.userId())
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
  );

  private readonly ranked = computed<Suggestion[]>(() => {
    const q = this.query().trim().toLowerCase().replace(/\s+/g, ' ');
    if (!q) return this.candidates().map((profile) => ({ profile, before: profile.display_name, match: '', after: '' }));

    const wordStart: Suggestion[] = [];
    const contains: Suggestion[] = [];
    for (const profile of this.candidates()) {
      const name = profile.display_name;
      const lower = name.toLowerCase();
      // Match at the start of the name or of any word ("w" → "Werner", "van der Walt").
      const wordIndex = lower.startsWith(q) ? 0 : lower.indexOf(' ' + q) >= 0 ? lower.indexOf(' ' + q) + 1 : -1;
      const index = wordIndex >= 0 ? wordIndex : lower.indexOf(q);
      if (index < 0) continue;
      const suggestion = {
        profile,
        before: name.slice(0, index),
        match: name.slice(index, index + q.length),
        after: name.slice(index + q.length)
      };
      (wordIndex >= 0 ? wordStart : contains).push(suggestion);
    }
    return [...wordStart, ...contains];
  });

  readonly suggestions = computed(() => this.ranked().slice(0, MAX_SUGGESTIONS));
  readonly moreCount = computed(() => Math.max(0, this.ranked().length - MAX_SUGGESTIONS));
  readonly full = computed(() => this.selected().length >= MAX_TAGS);

  readonly selectedProfiles = computed(() =>
    this.selected()
      .map((id) => this.reunion.profiles().find((p) => p.id === id))
      .filter((p) => !!p)
  );

  isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  onInput(value: string): void {
    this.query.set(value);
    this.active.set(0);
    this.open.set(true);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.suggestions().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.open.set(true);
      if (count) this.active.set((this.active() + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (event.key === 'Enter') {
      // Never submit the surrounding form from the tag field.
      event.preventDefault();
      const suggestion = this.suggestions()[this.active()];
      if (this.open() && suggestion) this.pick(suggestion.profile);
    } else if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      this.open.set(false);
    }
  }

  pick(profile: Profile): void {
    if (!this.isSelected(profile.id) && this.full()) return;
    this.toggle(profile.id);
    this.query.set('');
    this.active.set(0);
  }

  toggle(id: string): void {
    this.selected.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
}
