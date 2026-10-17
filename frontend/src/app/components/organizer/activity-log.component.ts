import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ReunionService } from '../../services/reunion.service';
import { UiService } from '../../services/ui.service';
import { ActivityEntry } from '../../models/reunion.model';
import { friendlyError } from '../../utils/errors';
import { downloadText, toCsv } from '../../utils/format';

type Category = ActivityEntry['category'];

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'session', label: 'Log-ins', icon: '🔑' },
  { id: 'content', label: 'Posts', icon: '📸' },
  { id: 'reaction', label: 'Hearts & votes', icon: '❤️' },
  { id: 'tag', label: 'Tags', icon: '🏷️' },
  { id: 'moderation', label: 'Moderation', icon: '🛡️' },
  { id: 'admin', label: 'Admin', icon: '⚙️' },
  { id: 'security', label: 'Security', icon: '🚨' }
];

const PAGE_SIZE = 200;
const REFRESH_MS = 15_000;

/** Super admin only: everything that happened in the app, newest first. */
@Component({
  selector: 'app-activity-log',
  standalone: true,
  template: `
    <div class="min-h-dvh pb-10">
      <header class="sticky top-0 z-40 bg-brakke-navy/90 backdrop-blur-md border-b border-brakke-line">
        <div class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <button type="button" class="btn-secondary px-3 py-2" (click)="router.navigate(['/feed'])">← Back</button>
            <h1 class="text-base font-bold text-white truncate">🧾 Activity log</h1>
          </div>
          <button type="button" class="btn-secondary px-3 py-2 text-xs shrink-0" [disabled]="busy()" (click)="exportCsv()">⬇️ CSV</button>
        </div>
      </header>

      <main class="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        <p class="text-xs text-slate-400">
          Only you (super admin) can see this. Updates every 15 seconds. No emails, photos or note texts are stored here;
          guests who use "Leave &amp; delete my data" show as "(deleted guest)".
        </p>

        <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
          <button type="button" [class]="filter() === null ? 'chip-on' : 'chip-off'" (click)="filter.set(null)">All</button>
          @for (c of categories; track c.id) {
            <button type="button" [class]="filter() === c.id ? 'chip-on' : 'chip-off'" (click)="filter.set(c.id)">
              {{ c.icon }} {{ c.label }} ({{ counts()[c.id] ?? 0 }})
            </button>
          }
        </div>

        <input
          type="search"
          class="input"
          placeholder="Search names or actions…"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          aria-label="Search the activity log"
        />

        @if (loading()) {
          <div class="py-16 flex flex-col items-center gap-3 text-slate-400 text-sm"><div class="spinner"></div>Loading activity…</div>
        } @else if (!visible().length) {
          <p class="card p-8 text-center text-slate-400">{{ entries().length ? 'No entries match.' : 'Nothing has happened yet.' }}</p>
        } @else {
          <ol class="space-y-2">
            @for (e of visible(); track e.id) {
              <li class="card p-3 flex items-start gap-3">
                <span class="text-lg leading-none mt-0.5" aria-hidden="true">{{ icon(e.category) }}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-slate-100 break-words">{{ e.summary }}</p>
                  <p class="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span class="tabular-nums">{{ time(e.at) }}</span>
                    @if (e.actor_role) {
                      <span class="px-1.5 rounded border"
                        [class]="e.actor_role === 'guest' ? 'border-brakke-line text-slate-300' : 'border-brakke-red/50 text-red-200'">
                        {{ e.actor_role }}
                      </span>
                    }
                  </p>
                </div>
              </li>
            }
          </ol>
          @if (hasMore()) {
            <div class="flex justify-center pt-2">
              <button type="button" class="btn-secondary" [disabled]="busy()" (click)="loadOlder()">
                {{ busy() ? 'Loading…' : 'Load older entries' }}
              </button>
            </div>
          }
        }
      </main>
    </div>
  `
})
export class ActivityLogComponent implements OnInit, OnDestroy {
  readonly router = inject(Router);
  private readonly reunion = inject(ReunionService);
  private readonly ui = inject(UiService);

  readonly categories = CATEGORIES;
  readonly entries = signal<ActivityEntry[]>([]);
  readonly filter = signal<Category | null>(null);
  readonly query = signal('');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly hasMore = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly counts = computed(() => {
    const counts: Partial<Record<Category, number>> = {};
    for (const e of this.entries()) counts[e.category] = (counts[e.category] ?? 0) + 1;
    return counts;
  });

  readonly visible = computed(() => {
    const f = this.filter();
    const q = this.query().trim().toLowerCase();
    return this.entries().filter(
      (e) => (!f || e.category === f) && (!q || e.summary.toLowerCase().includes(q) || (e.actor_name ?? '').toLowerCase().includes(q))
    );
  });

  async ngOnInit(): Promise<void> {
    try {
      const first = await this.reunion.fetchActivity({ limit: PAGE_SIZE });
      this.entries.set(first);
      this.hasMore.set(first.length === PAGE_SIZE);
    } catch (err) {
      this.ui.error(friendlyError(err, 'Could not load the activity log.'));
    } finally {
      this.loading.set(false);
    }
    this.timer = setInterval(() => void this.loadNewer(), REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async loadNewer(): Promise<void> {
    const newest = this.entries()[0]?.id;
    try {
      const fresh = await this.reunion.fetchActivity({ afterId: newest, limit: PAGE_SIZE });
      if (fresh.length) this.entries.update((list) => [...fresh, ...list.filter((e) => !fresh.some((f) => f.id === e.id))]);
    } catch {
      // Try again on the next tick.
    }
  }

  async loadOlder(): Promise<void> {
    const oldest = this.entries().at(-1)?.id;
    if (!oldest) return;
    this.busy.set(true);
    try {
      const older = await this.reunion.fetchActivity({ beforeId: oldest, limit: PAGE_SIZE });
      this.entries.update((list) => [...list, ...older]);
      this.hasMore.set(older.length === PAGE_SIZE);
    } catch (err) {
      this.ui.error(friendlyError(err));
    } finally {
      this.busy.set(false);
    }
  }

  async exportCsv(): Promise<void> {
    this.busy.set(true);
    try {
      const all: ActivityEntry[] = [];
      let before: number | undefined;
      for (let page = 0; page < 50; page++) {
        const batch = await this.reunion.fetchActivity({ beforeId: before, limit: 1000 });
        all.push(...batch);
        if (batch.length < 1000) break;
        before = batch.at(-1)!.id;
      }
      const rows = all
        .reverse()
        .map((e) => [new Date(e.at).toLocaleString(), e.category, e.actor_role ?? '', e.actor_name ?? '', e.summary]);
      downloadText(
        `bhs06-activity-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`,
        toCsv([['Time', 'Category', 'Role', 'Who', 'What happened'], ...rows])
      );
    } catch (err) {
      this.ui.error(friendlyError(err));
    } finally {
      this.busy.set(false);
    }
  }

  icon(category: Category): string {
    return CATEGORIES.find((c) => c.id === category)?.icon ?? '•';
  }

  time(at: string): string {
    const d = new Date(at);
    const sameDay = d.toDateString() === new Date().toDateString();
    const clock = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return sameDay ? clock : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${clock}`;
  }
}
