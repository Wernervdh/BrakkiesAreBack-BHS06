import { Component, computed, inject, signal } from '@angular/core';
import { ReunionService } from '../../../services/reunion.service';
import { SessionService } from '../../../services/session.service';
import { UiService } from '../../../services/ui.service';
import { MESSAGE_CATEGORIES, Message, MessageCategory } from '../../../models/reunion.model';
import { friendlyError } from '../../../utils/errors';
import { timeAgo } from '../../../utils/format';
import { MessageModalComponent } from '../../modals/message-modal.component';
import { TagListComponent } from '../../shared/tag-list.component';

const BADGE: Record<MessageCategory, string> = {
  thank_you: 'bg-brakke-gold/15 text-brakke-gold border-brakke-gold/40',
  memory: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  prediction_30th: 'bg-violet-500/15 text-violet-300 border-violet-500/40'
};

@Component({
  selector: 'app-capsule',
  standalone: true,
  imports: [MessageModalComponent, TagListComponent],
  template: `
    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-bold text-white">💬 Time Capsule</h2>
        <p class="text-xs text-slate-400">Thank-yous, memories and predictions for the 30th.</p>
      </div>

      <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
        <button type="button" [class]="filter() === null ? 'chip-on' : 'chip-off'" (click)="filter.set(null)">
          All ({{ reunion.messages().length }})
        </button>
        @for (c of categories; track c.value) {
          <button type="button" [class]="filter() === c.value ? 'chip-on' : 'chip-off'" (click)="filter.set(c.value)">
            {{ c.icon }} {{ c.label }} ({{ counts()[c.value] }})
          </button>
        }
      </div>

      @if (reunion.loading() && !reunion.messages().length) {
        <div class="py-16 flex flex-col items-center gap-3 text-slate-400 text-sm">
          <div class="spinner"></div>
          Loading notes…
        </div>
      } @else if (!visible().length) {
        <div class="card py-14 px-6 text-center">
          <p class="text-4xl mb-2">📜</p>
          <p class="font-bold text-white">No notes here yet</p>
          <p class="text-sm text-slate-400 mt-1 mb-5">Share a memory or thank the organising committee!</p>
          <button type="button" class="btn-primary" (click)="writing.set(true)">Write a note</button>
        </div>
      } @else {
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          @for (msg of visible(); track msg.id) {
            <article class="card p-4 flex flex-col justify-between gap-3">
              <div>
                <div class="flex items-center justify-between gap-2 mb-2">
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border" [class]="badge(msg.category)">
                    {{ label(msg.category) }}
                  </span>
                  <span class="text-[11px] text-slate-400">{{ timeAgo(msg.created_at) }}</span>
                </div>
                <p class="text-[15px] text-slate-100 leading-relaxed whitespace-pre-wrap break-words">{{ msg.content }}</p>
                <app-tag-list class="block mt-2" [ids]="msg.tagged_ids" (untagMe)="untagMe(msg)" />
              </div>
              <div class="pt-2 border-t border-brakke-line flex items-center justify-between gap-2">
                <span class="text-xs font-semibold text-brakke-gold truncate">
                  ✍️ {{ msg.author_name }}
                  @if (msg.owner_id === session.userId()) { <span class="text-[10px] ml-1">(you)</span> }
                </span>
                @if (msg.owner_id === session.userId() || session.isOrganizer()) {
                  <button type="button" class="btn-ghost-danger" (click)="remove(msg)">🗑️ Delete</button>
                }
              </div>
            </article>
          }
        </div>
      }
    </section>

    <button
      type="button"
      (click)="writing.set(true)"
      class="fixed bottom-24 right-5 z-30 btn-primary rounded-full px-5 shadow-xl shadow-black/40"
    >
      ✍️ Write note
    </button>

    @if (writing()) {
      <app-message-modal [initialCategory]="filter() ?? 'thank_you'" (closed)="writing.set(false)" />
    }
  `
})
export class CapsuleComponent {
  readonly reunion = inject(ReunionService);
  readonly session = inject(SessionService);
  private readonly ui = inject(UiService);

  readonly categories = MESSAGE_CATEGORIES;
  readonly filter = signal<MessageCategory | null>(null);
  readonly writing = signal(false);
  readonly timeAgo = timeAgo;

  readonly visible = computed(() => {
    const f = this.filter();
    return f ? this.reunion.messages().filter((m) => m.category === f) : this.reunion.messages();
  });

  readonly counts = computed(() => {
    const counts: Record<MessageCategory, number> = { thank_you: 0, memory: 0, prediction_30th: 0 };
    for (const m of this.reunion.messages()) counts[m.category]++;
    return counts;
  });

  badge(category: MessageCategory): string {
    return BADGE[category];
  }

  label(category: MessageCategory): string {
    const c = MESSAGE_CATEGORIES.find((x) => x.value === category);
    return c ? `${c.icon} ${c.label}` : category;
  }

  async untagMe(msg: Message): Promise<void> {
    const uid = this.session.userId();
    if (!uid) return;
    try {
      await this.reunion.removeMessageTag(msg, uid);
      this.ui.toast('Your tag was removed.');
    } catch (err) {
      this.ui.error(friendlyError(err));
    }
  }

  async remove(msg: Message): Promise<void> {
    const ok = await this.ui.confirm({
      title: 'Delete this note?',
      message: msg.owner_id === this.session.userId() ? 'Your note will be removed for everyone.' : `Remove this note by ${msg.author_name}?`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    try {
      await this.reunion.deleteMessage(msg);
      this.ui.success('Note deleted.');
    } catch (err) {
      this.ui.error(friendlyError(err));
    }
  }
}
