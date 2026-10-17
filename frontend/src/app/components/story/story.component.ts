import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ReunionService } from '../../services/reunion.service';
import { SessionService } from '../../services/session.service';
import { UiService } from '../../services/ui.service';
import { MESSAGE_CATEGORIES, Message, Photo } from '../../models/reunion.model';
import { friendlyError } from '../../utils/errors';
import { CrestComponent } from '../shared/crest.component';
import { TagListComponent } from '../shared/tag-list.component';

type StoryItem = { kind: 'photo'; at: string; photo: Photo } | { kind: 'note'; at: string; note: Message };

interface Chapter {
  key: string;
  title: string;
  items: StoryItem[];
}

/** "The Story": every photo and note in the order it was posted, grouped per hour. */
@Component({
  selector: 'app-story',
  standalone: true,
  imports: [CrestComponent, TagListComponent],
  template: `
    <div class="min-h-dvh pb-16">
      <header class="sticky top-0 z-40 bg-brakke-navy/90 backdrop-blur-md border-b border-brakke-line">
        <div class="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <button type="button" class="btn-secondary px-3 py-2" (click)="back()">← Back</button>
          @if (!reunion.storyPublished()) {
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-brakke-red/20 text-red-200 border border-brakke-red/40">
              Preview: only organisers
            </span>
          }
        </div>
      </header>

      <section class="relative overflow-hidden">
        <div class="absolute inset-0 crest-stripes pointer-events-none"></div>
        <div class="relative max-w-2xl mx-auto px-5 pt-10 pb-8 text-center flex flex-col items-center gap-3">
          <app-crest [size]="96" />
          <p class="text-xs uppercase tracking-[0.25em] text-brakke-gold font-bold">Matric 2006 • 20 years later</p>
          <h1 class="text-3xl sm:text-4xl font-extrabold text-white leading-tight">The Story of the Night</h1>
          @if (dateLabel()) {
            <p class="text-slate-300">{{ dateLabel() }}</p>
          }
          <div class="flex gap-6 mt-2 text-center">
            <div><p class="text-2xl font-extrabold text-white tabular-nums">{{ photos().length }}</p><p class="text-[11px] text-slate-400 uppercase">photos</p></div>
            <div><p class="text-2xl font-extrabold text-white tabular-nums">{{ reunion.messages().length }}</p><p class="text-[11px] text-slate-400 uppercase">notes</p></div>
            <div><p class="text-2xl font-extrabold text-white tabular-nums">{{ reunion.profiles().length }}</p><p class="text-[11px] text-slate-400 uppercase">Brakkies</p></div>
          </div>
        </div>
      </section>

      <main class="max-w-2xl mx-auto px-4">
        @if (loading()) {
          <div class="py-16 flex flex-col items-center gap-3 text-slate-400 text-sm"><div class="spinner"></div>Putting the story together…</div>
        } @else if (!chapters().length) {
          <p class="card p-8 text-center text-slate-400">Nothing has been posted yet. The story will write itself during the evening.</p>
        } @else {
          <ol class="relative border-l-2 border-brakke-gold/30 ml-3 space-y-10">
            @for (chapter of chapters(); track chapter.key; let first = $first) {
              <li class="pl-6">
                <span class="absolute -left-[9px] mt-1 w-4 h-4 rounded-full bg-brakke-gold ring-4 ring-brakke-deep"></span>
                <h2 class="text-sm font-extrabold uppercase tracking-widest text-brakke-gold mb-4">
                  {{ first ? 'It begins · ' : '' }}{{ chapter.title }}
                </h2>
                <div class="space-y-5">
                  @for (item of chapter.items; track item.kind + (item.kind === 'photo' ? item.photo.id : item.note.id)) {
                    @if (item.kind === 'photo') {
                      <figure class="card overflow-hidden">
                        <img [src]="item.photo.url" [alt]="'Photo by ' + item.photo.author_name" class="w-full h-auto bg-black/50" loading="lazy" decoding="async" />
                        <figcaption class="p-4 space-y-1.5">
                          @if (item.photo.caption) {
                            <p class="text-[15px] text-white">{{ item.photo.caption }}</p>
                          }
                          <app-tag-list [ids]="item.photo.tagged_ids" />
                          <p class="text-xs text-slate-400">
                            📸 {{ item.photo.author_name }} · {{ time(item.at) }} · #{{ item.photo.prompt_tag }}
                            @if (item.photo.likes_count) { · ❤️ {{ item.photo.likes_count }} }
                          </p>
                        </figcaption>
                      </figure>
                    } @else {
                      <blockquote class="card p-5 border-l-4 border-l-brakke-gold">
                        <p class="text-[11px] uppercase tracking-wider font-bold text-brakke-gold mb-2">{{ categoryLabel(item.note) }}</p>
                        <p class="text-[17px] leading-relaxed text-slate-100 whitespace-pre-wrap break-words">“{{ item.note.content }}”</p>
                        <app-tag-list class="block mt-2" [ids]="item.note.tagged_ids" />
                        <p class="text-xs text-slate-400 mt-2">— {{ item.note.author_name }} · {{ time(item.at) }}</p>
                      </blockquote>
                    }
                  }
                </div>
              </li>
            }
          </ol>

          <div class="text-center py-12 space-y-2">
            <p class="text-2xl">🎓</p>
            <p class="text-lg font-bold text-white">And that was the night.</p>
            <p class="text-slate-400 text-sm">See you at the 30th, Brakkies!</p>
          </div>
        }
      </main>
    </div>
  `
})
export class StoryComponent implements OnInit {
  readonly reunion = inject(ReunionService);
  private readonly session = inject(SessionService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  readonly photos = signal<Photo[]>([]);
  readonly loading = signal(true);

  readonly chapters = computed<Chapter[]>(() => {
    const items: StoryItem[] = [
      ...this.photos().map((photo) => ({ kind: 'photo' as const, at: photo.created_at, photo })),
      ...this.reunion.messages().map((note) => ({ kind: 'note' as const, at: note.created_at, note }))
    ].sort((a, b) => a.at.localeCompare(b.at));

    const chapters: Chapter[] = [];
    for (const item of items) {
      const d = new Date(item.at);
      const key = `${d.toDateString()}-${d.getHours()}`;
      let chapter = chapters.at(-1);
      if (!chapter || chapter.key !== key) {
        chapter = { key, title: this.hourTitle(d), items: [] };
        chapters.push(chapter);
      }
      chapter.items.push(item);
    }
    return chapters;
  });

  readonly dateLabel = computed(() => {
    const first = this.chapters()[0]?.items[0];
    return first
      ? new Date(first.at).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';
  });

  constructor() {
    // If an organiser hides the story while a guest is reading, send them back.
    effect(() => {
      if (!this.reunion.storyPublished() && !this.session.isOrganizer() && !this.loading()) {
        void this.router.navigate(['/feed']);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.reunion.start();
      this.photos.set(await this.reunion.fetchAllPhotos());
    } catch (err) {
      this.ui.error(friendlyError(err, 'Could not load the story.'));
    } finally {
      this.loading.set(false);
    }
  }

  back(): void {
    void this.router.navigate(['/feed']);
  }

  time(at: string): string {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  categoryLabel(note: Message): string {
    const c = MESSAGE_CATEGORIES.find((x) => x.value === note.category);
    return c ? `${c.icon} ${c.label}` : '';
  }

  private hourTitle(d: Date): string {
    const start = new Date(d);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const fmt = (x: Date) => x.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${fmt(start)} – ${fmt(end)}`;
  }
}
