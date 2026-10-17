import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../services/session.service';
import { ReunionService } from '../../services/reunion.service';
import { UiService } from '../../services/ui.service';
import { friendlyError } from '../../utils/errors';
import { CrestComponent } from '../shared/crest.component';
import { PhotoFeedComponent } from './tabs/photo-feed.component';
import { CapsuleComponent } from './tabs/capsule.component';
import { ThenNowComponent } from './tabs/then-now.component';
import { GuestsComponent } from './tabs/guests.component';
import { PhotoModalComponent } from '../modals/photo-modal.component';
import { OrganizerToolsModalComponent } from '../modals/organizer-tools-modal.component';

type Tab = 'feed' | 'capsule' | 'then_now' | 'guests';

const TAB_KEY = 'brakke_tab';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    CrestComponent,
    PhotoFeedComponent,
    CapsuleComponent,
    ThenNowComponent,
    GuestsComponent,
    PhotoModalComponent,
    OrganizerToolsModalComponent
  ],
  template: `
    <div class="min-h-dvh flex flex-col pb-24">
      <header class="sticky top-0 z-40 bg-brakke-navy/90 backdrop-blur-md border-b border-brakke-line">
        <div class="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <button type="button" class="flex items-center gap-3 min-w-0 text-left" (click)="setTab('feed')">
            <app-crest [size]="38" />
            <div class="min-w-0">
              <p class="text-[15px] font-extrabold text-white leading-tight truncate">
                '06 <span class="text-brakke-gold">BrakkiesAreBack</span>
              </p>
              <p class="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full" [class]="reunion.live() ? 'bg-emerald-400' : 'bg-slate-500'"></span>
                {{ reunion.live() ? 'Live' : 'Connecting…' }} • 20-Year Reunion
              </p>
            </div>
          </button>

          <div class="flex items-center gap-2 shrink-0">
            @if (session.isOrganizer()) {
              <span class="px-2.5 py-1.5 rounded-full text-xs font-bold bg-brakke-red/20 text-red-200 border border-brakke-red/40">🛡️ Organiser</span>
            } @else {
              <button type="button" class="btn-primary px-3.5 py-2" (click)="photoModalOpen.set(true)">📸 Snap</button>
            }
            <button
              type="button"
              class="btn-secondary w-10 h-10 p-0 text-lg"
              (click)="menuOpen.set(true)"
              aria-label="Open menu"
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      <main class="flex-1 max-w-3xl w-full mx-auto px-4 pt-4">
        @if (reunion.loadError()) {
          <div class="mb-4 p-3 rounded-xl text-sm bg-brakke-red/15 border border-brakke-red/40 text-red-200 flex items-center justify-between gap-3">
            <span>Could not load everything. Check your connection.</span>
            <button type="button" class="btn-secondary px-3 py-1.5 text-xs" (click)="reunion.refreshAll()">Retry</button>
          </div>
        }

        @switch (tab()) {
          @case ('feed') { <app-photo-feed (snap)="photoModalOpen.set(true)" /> }
          @case ('capsule') { <app-capsule /> }
          @case ('then_now') { <app-then-now /> }
          @case ('guests') { <app-guests /> }
        }
      </main>

      <nav class="fixed bottom-0 inset-x-0 z-40 bg-brakke-navy/95 backdrop-blur-xl border-t border-brakke-line pb-safe">
        <div class="max-w-md mx-auto grid grid-cols-4 h-16">
          @for (item of tabs; track item.id) {
            <button
              type="button"
              (click)="setTab(item.id)"
              class="flex flex-col items-center justify-center gap-0.5 transition"
              [class]="tab() === item.id ? 'text-brakke-gold' : 'text-slate-400 hover:text-slate-200'"
              [attr.aria-current]="tab() === item.id ? 'page' : null"
            >
              <span class="text-xl leading-none">{{ item.icon }}</span>
              <span class="text-[10px] font-bold">{{ item.label }}</span>
            </button>
          }
        </div>
      </nav>

      @if (menuOpen()) {
        <div class="sheet-backdrop" (click)="menuOpen.set(false)">
          <div class="sheet space-y-2" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Menu">
            <div class="flex items-center gap-3 pb-4 mb-2 border-b border-brakke-line">
              <div class="w-11 h-11 rounded-full bg-brakke-gold/20 border border-brakke-gold/40 flex items-center justify-center text-brakke-gold font-bold">
                {{ (session.profile()?.display_name ?? '?').charAt(0) }}
              </div>
              <div class="min-w-0">
                <p class="font-bold text-white truncate">{{ session.profile()?.display_name }}</p>
                <p class="text-xs text-slate-400">
                  {{ session.isOrganizer() ? '🛡️ Organiser (moderator)' : 'Checked in on this phone' }}
                </p>
              </div>
            </div>

            @if (reunion.storyPublished() || session.isOrganizer()) {
              <a routerLink="/story" class="menu-item">
                📖 <span>The Story of the Night</span>
                @if (!reunion.storyPublished()) {
                  <span class="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-brakke-red/20 text-red-200">Hidden</span>
                }
              </a>
            }
            <a routerLink="/about" class="menu-item">ℹ️ <span>About &amp; how it works</span></a>
            @if (session.isOrganizer()) {
              <button type="button" class="menu-item" (click)="menuOpen.set(false); toolsOpen.set(true)">
                🛡️ <span>Organiser tools &amp; export</span>
              </button>
              <button type="button" class="menu-item text-red-300" (click)="logout()">
                🚪 <span>Log out</span>
              </button>
            } @else {
              <button type="button" class="menu-item text-red-300" (click)="leave()">
                🚪 <span>Leave &amp; delete my data</span>
              </button>
            }

            <button type="button" class="btn-secondary w-full mt-3" (click)="menuOpen.set(false)">Close</button>
          </div>
        </div>
      }

      @if (photoModalOpen()) {
        <app-photo-modal (closed)="photoModalOpen.set(false)" (posted)="onPhotoPosted()" />
      }
      @if (toolsOpen()) {
        <app-organizer-tools-modal (closed)="toolsOpen.set(false)" />
      }
    </div>
  `,
  styles: [
    `
      .menu-item {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 0.75rem;
        padding: 0.875rem 1rem;
        border-radius: 0.75rem;
        font-weight: 600;
        font-size: 0.95rem;
        text-align: left;
        transition: background 0.15s;
      }
      .menu-item:hover {
        background: #132a56;
      }
    `
  ]
})
export class DashboardComponent implements OnInit {
  readonly session = inject(SessionService);
  readonly reunion = inject(ReunionService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  readonly tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'feed', icon: '📸', label: 'Paparazzi' },
    { id: 'capsule', icon: '💬', label: 'Capsule' },
    { id: 'then_now', icon: '🎭', label: 'Then & Now' },
    { id: 'guests', icon: '👥', label: "Who's Here" }
  ];

  readonly tab = signal<Tab>(this.restoreTab());
  readonly menuOpen = signal(false);
  readonly photoModalOpen = signal(false);
  readonly toolsOpen = signal(false);

  constructor() {
    // An organiser removed this guest: stop live updates and go back to the welcome page.
    effect(() => {
      if (!this.session.profile()) {
        this.reunion.stop();
        void this.router.navigate(['/welcome']);
      }
    });
  }

  ngOnInit(): void {
    // Keeps running while visiting the Story / organiser pages; stopped on leave or removal.
    void this.reunion.start();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    window.scrollTo({ top: 0 });
    try {
      sessionStorage.setItem(TAB_KEY, tab);
    } catch {
      // Storage unavailable (private mode); not important.
    }
  }

  onPhotoPosted(): void {
    this.photoModalOpen.set(false);
    this.setTab('feed');
    this.ui.success('Photo posted! 📸');
  }

  async leave(): Promise<void> {
    this.menuOpen.set(false);
    const ok = await this.ui.confirm({
      title: 'Leave and delete your data?',
      message:
        'This removes you from Who\'s Here and permanently deletes everything you posted: photos, notes, your Then & Now entry, hearts and votes.\n\nThis cannot be undone.',
      confirmLabel: 'Delete & leave',
      danger: true
    });
    if (!ok) return;
    try {
      const uid = this.session.userId();
      if (uid) await this.reunion.removeUserFiles(uid);
      await this.session.leave();
      this.reunion.stop();
      await this.router.navigate(['/welcome']);
      this.ui.toast('You have left the reunion app. Your data was deleted.');
    } catch (err) {
      this.ui.error(friendlyError(err, 'Could not delete your data. Please try again.'));
    }
  }

  /** Organisers only: ends the moderator session (they have no posts to lose). */
  async logout(): Promise<void> {
    this.menuOpen.set(false);
    const ok = await this.ui.confirm({
      title: 'Log out?',
      message: 'You can log in again any time from the welcome page with the organiser code.',
      confirmLabel: 'Log out'
    });
    if (!ok) return;
    try {
      await this.session.leave();
      this.reunion.stop();
      await this.router.navigate(['/welcome']);
      this.ui.toast('Logged out.');
    } catch (err) {
      this.ui.error(friendlyError(err, 'Could not log out. Please try again.'));
    }
  }

  private restoreTab(): Tab {
    try {
      const saved = sessionStorage.getItem(TAB_KEY) as Tab | null;
      if (saved && ['feed', 'capsule', 'then_now', 'guests'].includes(saved)) return saved;
    } catch {
      // Storage unavailable.
    }
    return 'feed';
  }
}
