import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SupabaseService } from '../../services/supabase.service';
import { Photo, Message, ThenNowProfile, MessageCategory, Profile } from '../../models/reunion.model';
import { PhotoModalComponent } from '../modals/photo-modal.component';
import { MessageModalComponent } from '../modals/message-modal.component';

type ActiveTab = 'feed' | 'messages' | 'then_now' | 'guests';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, PhotoModalComponent, MessageModalComponent],
  template: `
    <div class="min-h-screen bg-[#070f1e] pb-24 text-slate-100 flex flex-col">
      <!-- Top Navigation Bar -->
      <header class="sticky top-0 z-40 bg-[#0a192f]/90 backdrop-blur-md border-b border-brakke-gold/20 px-4 py-3">
        <div class="max-w-3xl mx-auto flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-brakke-gold to-brakke-goldDark p-[1.5px] flex items-center justify-center">
              <div class="w-full h-full bg-[#0a192f] rounded-xl flex items-center justify-center font-black text-brakke-gold text-sm">
                '06
              </div>
            </div>
            <div>
              <h1 class="text-base font-bold text-white tracking-tight leading-tight">
                '06 <span class="text-brakke-gold">BrakkiesAreBack</span> BHS
              </h1>
              <p class="text-[11px] text-slate-400">Brackenfell High • 20-Year</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            @if (isAdmin()) {
              <span class="text-xs px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 font-bold border border-red-500/40">
                🛡️ ADMIN
              </span>
            }
            <span class="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-medium border border-slate-700/60 hidden sm:inline-block">
              👋 {{ userName() }}
            </span>
            <button
              (click)="openPhotoModal()"
              class="px-3.5 py-2 rounded-xl text-xs font-bold bg-brakke-gold hover:bg-brakke-goldLight text-slate-950 shadow-sm transition flex items-center gap-1.5"
            >
              <span>📸 Snap</span>
            </button>
          </div>
        </div>
      </header>

      <!-- Main Content Container -->
      <main class="flex-1 max-w-3xl w-full mx-auto px-4 pt-4">
        <!-- ========================================== -->
        <!-- TAB 1: PAPARAZZI FEED                      -->
        <!-- ========================================== -->
        @if (currentTab() === 'feed') {
          <div class="space-y-4">
            <div class="flex items-center justify-between pb-1">
              <h2 class="text-lg font-bold text-white flex items-center gap-2">
                <span>📸 Paparazzi Wall</span>
                <span class="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live Updates
                </span>
              </h2>
              <span class="text-xs text-slate-400 font-medium">{{ photos().length }} Photos</span>
            </div>

            @if (loadingPhotos()) {
              <div class="py-16 text-center text-slate-400">
                <div class="w-8 h-8 border-2 border-brakke-gold border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p class="text-xs">Loading venue snaps...</p>
              </div>
            } @else if (photos().length === 0) {
              <div class="py-16 text-center bg-[#112240]/40 rounded-3xl border border-slate-800 p-8">
                <span class="text-4xl block mb-2">📸</span>
                <p class="text-base font-bold text-white mb-1">No photos uploaded yet!</p>
                <p class="text-xs text-slate-400 mb-4">Be the first to capture an unforgettable reunion moment.</p>
                <button
                  (click)="openPhotoModal()"
                  class="px-5 py-2.5 rounded-xl font-bold text-xs bg-brakke-gold text-slate-950 shadow-md"
                >
                  Take First Photo
                </button>
              </div>
            } @else {
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                @for (photo of photos(); track photo.id) {
                  <article class="bg-[#112240]/70 border border-slate-800 rounded-2xl overflow-hidden shadow-lg transition hover:border-brakke-gold/30">
                    <div class="relative w-full aspect-[4/3] bg-black/60 overflow-hidden">
                      <img
                        [src]="photo.image_url"
                        [alt]="photo.prompt_tag"
                        class="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                        loading="lazy"
                      />
                      <div class="absolute top-2.5 left-2.5">
                        <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-black/75 text-brakke-gold border border-brakke-gold/40 backdrop-blur-md">
                          #{{ photo.prompt_tag }}
                        </span>
                      </div>
                    </div>

                    <div class="p-3.5 flex items-center justify-between">
                      <div>
                        <p class="text-sm font-semibold text-white truncate max-w-[170px] sm:max-w-[190px]">
                          {{ photo.author_name }}
                        </p>
                        <p class="text-[11px] text-slate-400">
                          {{ formatTimestamp(photo.created_at) }}
                        </p>
                      </div>

                      <div class="flex items-center gap-2">
                        @if (isAdmin()) {
                          <button
                            (click)="deletePhoto(photo)"
                            class="px-2.5 py-1.5 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-bold transition flex items-center gap-1"
                            title="Admin delete photo"
                          >
                            <span>🗑️</span>
                          </button>
                        }
                        <button
                          (click)="likePhoto(photo)"
                          [disabled]="hasVotedPhoto(photo.id)"
                          [class]="hasVotedPhoto(photo.id)
                            ? 'bg-rose-500/30 text-rose-300 border-rose-500/50 cursor-default'
                            : 'bg-[#1b2d4f] hover:bg-rose-500/20 hover:text-rose-400 text-slate-200 border-slate-700 hover:border-rose-500/40 active:scale-95'"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition"
                          [title]="hasVotedPhoto(photo.id) ? 'You already loved this photo' : 'Like photo'"
                        >
                          <span class="text-base text-rose-500">❤️</span>
                          <span class="text-xs font-bold font-mono">{{ photo.likes_count }}</span>
                        </button>
                      </div>
                    </div>
                  </article>
                }
              </div>
            }
          </div>
        }

        <!-- ========================================== -->
        <!-- TAB 2: TIME CAPSULE WALL                   -->
        <!-- ========================================== -->
        @if (currentTab() === 'messages') {
          <div class="space-y-4">
            <div class="flex items-center justify-between pb-1">
              <h2 class="text-lg font-bold text-white flex items-center gap-2">
                <span>💬 Time Capsule & Wall of Fame</span>
              </h2>
            </div>

            <!-- Filter Categories -->
            <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                (click)="filterCategory.set(null); loadMessages()"
                [class]="filterCategory() === null ? 'bg-brakke-gold text-slate-950 font-bold' : 'bg-[#112240] text-slate-400'"
                class="px-3 py-1.5 rounded-full text-xs transition shrink-0"
              >
                All ({{ messages().length }})
              </button>
              <button
                (click)="filterCategory.set('thank_you'); loadMessages()"
                [class]="filterCategory() === 'thank_you' ? 'bg-brakke-gold text-slate-950 font-bold' : 'bg-[#112240] text-slate-400'"
                class="px-3 py-1.5 rounded-full text-xs transition shrink-0"
              >
                🙏 Thank You
              </button>
              <button
                (click)="filterCategory.set('memory'); loadMessages()"
                [class]="filterCategory() === 'memory' ? 'bg-brakke-gold text-slate-950 font-bold' : 'bg-[#112240] text-slate-400'"
                class="px-3 py-1.5 rounded-full text-xs transition shrink-0"
              >
                💭 Memories
              </button>
              <button
                (click)="filterCategory.set('prediction_30th'); loadMessages()"
                [class]="filterCategory() === 'prediction_30th' ? 'bg-brakke-gold text-slate-950 font-bold' : 'bg-[#112240] text-slate-400'"
                class="px-3 py-1.5 rounded-full text-xs transition shrink-0"
              >
                🔮 30th Predictions
              </button>
            </div>

            @if (loadingMessages()) {
              <div class="py-16 text-center text-slate-400">
                <div class="w-8 h-8 border-2 border-brakke-gold border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p class="text-xs">Loading time capsule notes...</p>
              </div>
            } @else if (messages().length === 0) {
              <div class="py-16 text-center bg-[#112240]/40 rounded-3xl border border-slate-800 p-8">
                <span class="text-4xl block mb-2">📜</span>
                <p class="text-base font-bold text-white mb-1">No notes in this category yet.</p>
                <p class="text-xs text-slate-400 mb-4">Share a memory or send love to the organizing committee!</p>
                <button
                  (click)="openMessageModal()"
                  class="px-5 py-2.5 rounded-xl font-bold text-xs bg-brakke-gold text-slate-950 shadow-md"
                >
                  Write a Note
                </button>
              </div>
            } @else {
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                @for (msg of messages(); track msg.id) {
                  <article class="bg-[#112240]/80 border border-slate-800/80 rounded-2xl p-4 shadow flex flex-col justify-between">
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <span
                          [class]="getCategoryBadgeClass(msg.category)"
                          class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                        >
                          {{ getCategoryLabel(msg.category) }}
                        </span>
                        <span class="text-[10px] text-slate-400">
                          {{ formatTimestamp(msg.created_at) }}
                        </span>
                      </div>
                      <p class="text-sm text-slate-200 leading-relaxed font-normal mb-3 whitespace-pre-wrap">
                        {{ msg.content }}
                      </p>
                    </div>

                    <div class="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                      <span class="text-xs font-semibold text-brakke-gold">
                        ✍️ {{ msg.author_name }}
                      </span>
                      @if (isAdmin()) {
                        <button
                          (click)="deleteMessage(msg)"
                          class="px-2 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[11px] font-bold transition flex items-center gap-1"
                          title="Admin delete note"
                        >
                          <span>🗑️ Delete</span>
                        </button>
                      }
                    </div>
                  </article>
                }
              </div>
            }
          </div>
        }

        <!-- ========================================== -->
        <!-- TAB 3: THEN & NOW (FACE MATCHER)           -->
        <!-- ========================================== -->
        @if (currentTab() === 'then_now') {
          <div class="space-y-4">
            <div class="flex items-center justify-between pb-1">
              <div>
                <h2 class="text-lg font-bold text-white">🎭 Then & Now: Face Matcher</h2>
                <p class="text-xs text-slate-400">2006 Matric Photo vs 2026 Reunion — Vote for "Most Changed"!</p>
              </div>
              <button
                (click)="openPhotoModal('Then & Now')"
                class="px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-brakke-gold to-amber-500 text-slate-950 shadow-md flex items-center gap-1 shrink-0"
              >
                <span>➕ Add Mine</span>
              </button>
            </div>

            @if (loadingThenNow()) {
              <div class="py-16 text-center text-slate-400">
                <div class="w-8 h-8 border-2 border-brakke-gold border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p class="text-xs">Loading profiles...</p>
              </div>
            } @else {
              <div class="space-y-4">
                @for (entry of thenNowProfiles(); track entry.id) {
                  <div class="bg-[#112240]/80 border border-slate-800 rounded-3xl p-4 shadow-lg">
                    <div class="flex items-center justify-between mb-3">
                      <h3 class="text-base font-bold text-white flex items-center gap-2">
                        <span>🎓 {{ entry.student_name }}</span>
                      </h3>
                      <div class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brakke-gold/15 text-brakke-gold border border-brakke-gold/30 text-xs font-bold font-mono">
                        <span>🔥 {{ entry.votes_most_changed }} votes</span>
                      </div>
                    </div>

                    <!-- Dual Comparison Pictures -->
                    <div class="grid grid-cols-2 gap-2 mb-4">
                      <div class="relative rounded-2xl overflow-hidden aspect-square bg-black/60 border border-slate-700">
                        <img
                          [src]="entry.yearbook_image_url"
                          alt="2006 Matric"
                          class="w-full h-full object-cover"
                        />
                        <span class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-bold text-slate-300">
                          2006 (Matric)
                        </span>
                      </div>

                      <div class="relative rounded-2xl overflow-hidden aspect-square bg-black/60 border border-brakke-gold/40">
                        <img
                          [src]="entry.current_image_url"
                          alt="2026 Reunion"
                          class="w-full h-full object-cover"
                        />
                        <span class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-brakke-gold text-[10px] font-black text-slate-950">
                          2026 (Now)
                        </span>
                      </div>
                    </div>

                    <!-- Vote Button & Admin Delete -->
                    <div class="flex items-center gap-2">
                      <button
                        (click)="voteThenNow(entry)"
                        [disabled]="hasVotedThenNow(entry.id)"
                        [class]="hasVotedThenNow(entry.id)
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 cursor-default'
                          : 'bg-[#1b2d4f] hover:bg-brakke-gold hover:text-slate-950 text-slate-200 border-slate-700 hover:border-brakke-gold active:scale-[0.99]'"
                        class="flex-1 py-3 px-4 rounded-xl font-bold text-xs border transition flex items-center justify-center gap-2"
                      >
                        @if (hasVotedThenNow(entry.id)) {
                          <span>✓ Voted Most Changed</span>
                        } @else {
                          <span>⚡ Vote Most Changed</span>
                        }
                      </button>
                      @if (isAdmin()) {
                        <button
                          (click)="deleteThenNow(entry)"
                          class="py-3 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-bold transition"
                          title="Admin delete profile"
                        >
                          <span>🗑️</span>
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }
        <!-- ========================================== -->
        <!-- TAB 4: WHO'S HERE (GUEST REGISTRY)         -->
        <!-- ========================================== -->
        @if (currentTab() === 'guests') {
          <div class="space-y-4">
            <div class="flex items-center justify-between pb-1">
              <div>
                <h2 class="text-lg font-bold text-white flex items-center gap-2">
                  <span>👥 Classmates & Guests</span>
                  <span class="text-xs px-2 py-0.5 rounded-full bg-brakke-gold/20 text-brakke-gold border border-brakke-gold/30">
                    {{ profiles().length }} Checked In
                  </span>
                </h2>
                <p class="text-xs text-slate-400">Class of 2006 attending the 20-Year Reunion</p>
              </div>
            </div>

            @if (loadingProfiles()) {
              <div class="py-16 text-center text-slate-400">
                <div class="w-8 h-8 border-2 border-brakke-gold border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p class="text-xs">Loading guest list...</p>
              </div>
            } @else {
              <div class="space-y-2.5">
                @for (guest of profiles(); track guest.id) {
                  <div class="bg-[#112240]/80 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-brakke-gold/30 to-brakke-navy border border-brakke-gold/40 flex items-center justify-center font-bold text-brakke-gold text-sm shadow">
                        {{ getInitials(guest.display_name) }}
                      </div>
                      <div>
                        <div class="flex items-center gap-2">
                          <p class="text-sm font-bold text-white">
                            {{ guest.display_name }}
                          </p>
                          @if (guest.is_organizer) {
                            <span class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-brakke-gold text-slate-950">
                              Committee
                            </span>
                          }
                        </div>
                        <p class="text-[11px] text-slate-400">
                          {{ guest.email ? guest.email : 'Joined via QR Code' }}
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" title="Active"></span>
                      @if (isAdmin() && guest.display_name !== userName()) {
                        <button
                          (click)="deleteProfile(guest)"
                          class="px-2 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-bold transition"
                          title="Admin delete guest"
                        >
                          <span>🗑️</span>
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }
      </main>

      <!-- Floating Action Button for Messages on tab 2 -->
      @if (currentTab() === 'messages') {
        <button
          (click)="openMessageModal()"
          class="fixed bottom-20 right-5 z-40 px-4 py-3 rounded-full font-bold text-xs bg-gradient-to-r from-brakke-gold to-amber-500 text-slate-950 shadow-xl shadow-brakke-gold/25 hover:scale-105 active:scale-95 transition flex items-center gap-2"
        >
          <span>✍️ Write Note</span>
        </button>
      }

      <!-- Bottom Mobile App Navigation Bar -->
      <nav class="fixed bottom-0 left-0 right-0 z-40 bg-[#0a192f]/95 backdrop-blur-xl border-t border-slate-800">
        <div class="max-w-md mx-auto grid grid-cols-4 h-16">
          <button
            (click)="currentTab.set('feed')"
            [class]="currentTab() === 'feed' ? 'text-brakke-gold' : 'text-slate-400 hover:text-slate-200'"
            class="flex flex-col items-center justify-center gap-1 transition"
          >
            <span class="text-xl">📸</span>
            <span class="text-[10px] font-bold">Paparazzi</span>
          </button>

          <button
            (click)="currentTab.set('messages')"
            [class]="currentTab() === 'messages' ? 'text-brakke-gold' : 'text-slate-400 hover:text-slate-200'"
            class="flex flex-col items-center justify-center gap-1 transition"
          >
            <span class="text-xl">💬</span>
            <span class="text-[10px] font-bold">Capsule</span>
          </button>

          <button
            (click)="currentTab.set('then_now')"
            [class]="currentTab() === 'then_now' ? 'text-brakke-gold' : 'text-slate-400 hover:text-slate-200'"
            class="flex flex-col items-center justify-center gap-1 transition"
          >
            <span class="text-xl">🎭</span>
            <span class="text-[10px] font-bold">Then & Now</span>
          </button>

          <button
            (click)="currentTab.set('guests')"
            [class]="currentTab() === 'guests' ? 'text-brakke-gold' : 'text-slate-400 hover:text-slate-200'"
            class="flex flex-col items-center justify-center gap-1 transition"
          >
            <span class="text-xl">👥</span>
            <span class="text-[10px] font-bold">Who's Here</span>
          </button>
        </div>
      </nav>

      <!-- Modals -->
      @if (isPhotoModalOpen()) {
        <app-photo-modal
          [authorName]="userName()"
          [initialPrompt]="modalInitialPrompt()"
          (close)="isPhotoModalOpen.set(false)"
          (photoUploaded)="handlePhotoUpload($event)"
          (thenNowUploaded)="handleThenNowUpload($event)"
        ></app-photo-modal>
      }

      @if (isMessageModalOpen()) {
        <app-message-modal
          [authorName]="userName()"
          (close)="isMessageModalOpen.set(false)"
          (messagePosted)="handleMessagePost($event)"
        ></app-message-modal>
      }
    </div>
  `
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);

  currentTab = signal<ActiveTab>('feed');
  userName = signal<string>('Brakke Matriek');
  isAdmin = signal<boolean>(false);

  // Feeds data signals
  photos = signal<Photo[]>([]);
  messages = signal<Message[]>([]);
  thenNowProfiles = signal<ThenNowProfile[]>([]);
  profiles = signal<Profile[]>([]);

  // Loading states
  loadingPhotos = signal(true);
  loadingMessages = signal(true);
  loadingThenNow = signal(true);
  loadingProfiles = signal(true);

  // Modals state
  isPhotoModalOpen = signal(false);
  isMessageModalOpen = signal(false);
  modalInitialPrompt = signal<any>('Mid-laugh');

  // Filter
  filterCategory = signal<MessageCategory | null>(null);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    const storedName = this.supabaseService.getStoredUserName();
    if (!storedName) {
      this.router.navigate(['/welcome']);
      return;
    }
    this.userName.set(storedName);
    this.isAdmin.set(this.supabaseService.isAdminUser());

    // Initial data loads
    this.loadPhotos();
    this.loadMessages();
    this.loadThenNowProfiles();
    this.loadProfiles();

    // Subscribe to real-time events
    this.initRealtimeSubscriptions();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.supabaseService.unsubscribeAll();
  }

  async loadPhotos(): Promise<void> {
    this.loadingPhotos.set(true);
    try {
      const data = await this.supabaseService.getPhotos();
      this.photos.set(data);
    } finally {
      this.loadingPhotos.set(false);
    }
  }

  async loadMessages(): Promise<void> {
    this.loadingMessages.set(true);
    try {
      const category = this.filterCategory() || undefined;
      const data = await this.supabaseService.getMessages(category);
      this.messages.set(data);
    } finally {
      this.loadingMessages.set(false);
    }
  }

  async loadThenNowProfiles(): Promise<void> {
    this.loadingThenNow.set(true);
    try {
      const data = await this.supabaseService.getThenNowProfiles();
      this.thenNowProfiles.set(data);
    } finally {
      this.loadingThenNow.set(false);
    }
  }

  async loadProfiles(): Promise<void> {
    this.loadingProfiles.set(true);
    try {
      const data = await this.supabaseService.getProfiles();
      this.profiles.set(data);
    } finally {
      this.loadingProfiles.set(false);
    }
  }

  private initRealtimeSubscriptions(): void {
    // 1. Photos changes
    this.subscriptions.add(
      this.supabaseService.onPhotosChange().subscribe((payload) => {
        if (payload.eventType === 'INSERT') {
          const newPhoto = payload.new as Photo;
          this.photos.update((list) => [newPhoto, ...list]);
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Photo;
          this.photos.update((list) =>
            list.map((p) => (p.id === updated.id ? updated : p))
          );
        } else if (payload.eventType === 'DELETE') {
          const oldPhoto = payload.old as Partial<Photo>;
          this.photos.update((list) => list.filter((p) => p.id !== oldPhoto.id));
        }
      })
    );

    // 2. Messages changes
    this.subscriptions.add(
      this.supabaseService.onMessagesChange().subscribe((payload) => {
        if (payload.eventType === 'INSERT') {
          const newMsg = payload.new as Message;
          const currentFilter = this.filterCategory();
          if (!currentFilter || currentFilter === newMsg.category) {
            this.messages.update((list) => [newMsg, ...list]);
          }
        } else if (payload.eventType === 'DELETE') {
          const oldMsg = payload.old as Partial<Message>;
          this.messages.update((list) => list.filter((m) => m.id !== oldMsg.id));
        }
      })
    );

    // 3. Then & Now votes & deletes
    this.subscriptions.add(
      this.supabaseService.onThenNowProfilesChange().subscribe((payload) => {
        if (payload.eventType === 'INSERT') {
          const newEntry = payload.new as ThenNowProfile;
          this.thenNowProfiles.update((list) => {
            if (list.some((item) => item.id === newEntry.id)) return list;
            return [newEntry, ...list];
          });
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as ThenNowProfile;
          this.thenNowProfiles.update((list) =>
            list
              .map((p) => (p.id === updated.id ? updated : p))
              .sort((a, b) => b.votes_most_changed - a.votes_most_changed)
          );
        } else if (payload.eventType === 'DELETE') {
          const oldProfile = payload.old as Partial<ThenNowProfile>;
          this.thenNowProfiles.update((list) => list.filter((p) => p.id !== oldProfile.id));
        }
      })
    );

    // 4. Profiles (Who's Here) changes
    this.subscriptions.add(
      this.supabaseService.onProfilesChange().subscribe((payload) => {
        if (payload.eventType === 'INSERT') {
          const newProfile = payload.new as Profile;
          this.profiles.update((list) => {
            if (list.some(p => p.id === newProfile.id || p.display_name.toLowerCase() === newProfile.display_name.toLowerCase())) {
              return list;
            }
            return [newProfile, ...list];
          });
        } else if (payload.eventType === 'DELETE') {
          const oldGuest = payload.old as Partial<Profile>;
          this.profiles.update((list) => list.filter((p) => p.id !== oldGuest.id));
        }
      })
    );
  }

  // Vote check helpers
  hasVotedPhoto(photoId: string): boolean {
    return this.supabaseService.hasVotedPhoto(photoId);
  }

  hasVotedThenNow(profileId: string): boolean {
    return this.supabaseService.hasVotedThenNow(profileId);
  }

  // User Actions
  async likePhoto(photo: Photo): Promise<void> {
    if (this.hasVotedPhoto(photo.id)) return;
    this.supabaseService.recordPhotoVote(photo.id);

    // Optimistic UI update
    this.photos.update((list) =>
      list.map((p) =>
        p.id === photo.id ? { ...p, likes_count: p.likes_count + 1 } : p
      )
    );
    try {
      await this.supabaseService.likePhoto(photo.id);
    } catch (err) {
      console.error('Error liking photo:', err);
    }
  }

  async voteThenNow(entry: ThenNowProfile): Promise<void> {
    if (this.hasVotedThenNow(entry.id)) return;
    this.supabaseService.recordThenNowVote(entry.id);

    this.thenNowProfiles.update((list) =>
      list
        .map((p) =>
          p.id === entry.id
            ? { ...p, votes_most_changed: p.votes_most_changed + 1 }
            : p
        )
        .sort((a, b) => b.votes_most_changed - a.votes_most_changed)
    );
    try {
      await this.supabaseService.voteThenNowProfile(entry.id);
    } catch (err) {
      console.error('Error voting for then/now profile:', err);
    }
  }

  openPhotoModal(prompt: any = 'Mid-laugh'): void {
    this.modalInitialPrompt.set(prompt);
    this.isPhotoModalOpen.set(true);
  }

  openMessageModal(): void {
    this.isMessageModalOpen.set(true);
  }

  async handleThenNowUpload(payload: { student_name: string; yearbook_file: File; current_file: File }): Promise<void> {
    try {
      const created = await this.supabaseService.uploadThenNowProfile(payload);
      this.thenNowProfiles.update((list) => {
        if (list.some((item) => item.id === created.id)) return list;
        return [created, ...list];
      });
      this.isPhotoModalOpen.set(false);
    } catch (err) {
      console.error('Then & Now upload failed:', err);
      this.isPhotoModalOpen.set(false);
    }
  }

  async handlePhotoUpload(payload: { file: File; author_name: string; prompt_tag: string }): Promise<void> {
    try {
      const created = await this.supabaseService.uploadPhoto(payload);
      // Ensure locally present in case realtime has slight network latency
      this.photos.update((list) => {
        if (list.some((p) => p.id === created.id)) return list;
        return [created, ...list];
      });
      this.isPhotoModalOpen.set(false);
    } catch (err: any) {
      console.error('Upload failed:', err);
      // If error occurs, inform modal to reset loading state
      const modal = document.querySelector('app-photo-modal') as any;
      if (modal) {
        alert('Upload warning: ' + (err?.message || 'Could not reach Supabase. Photo displayed in preview.'));
      }
      this.isPhotoModalOpen.set(false);
    }
  }

  async handleMessagePost(payload: {
    author_name: string;
    content: string;
    category: MessageCategory;
  }): Promise<void> {
    try {
      const created = await this.supabaseService.postMessage(payload);
      this.messages.update((list) => {
        if (list.some((m) => m.id === created.id)) return list;
        return [created, ...list];
      });
      this.isMessageModalOpen.set(false);
    } catch (err) {
      console.error('Post failed:', err);
    }
  }

  // Admin Actions
  async deletePhoto(photo: Photo): Promise<void> {
    if (!this.isAdmin()) return;
    if (!confirm(`Delete photo by "${photo.author_name}"?`)) return;
    this.photos.update((list) => list.filter((p) => p.id !== photo.id));
    try {
      await this.supabaseService.deletePhoto(photo.id);
    } catch (err) {
      console.error('Error deleting photo:', err);
    }
  }

  async deleteMessage(message: Message): Promise<void> {
    if (!this.isAdmin()) return;
    if (!confirm(`Delete note by "${message.author_name}"?`)) return;
    this.messages.update((list) => list.filter((m) => m.id !== message.id));
    try {
      await this.supabaseService.deleteMessage(message.id);
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  }

  async deleteProfile(profile: Profile): Promise<void> {
    if (!this.isAdmin()) return;
    if (!confirm(`Remove guest "${profile.display_name}"?`)) return;
    this.profiles.update((list) => list.filter((p) => p.id !== profile.id));
    try {
      await this.supabaseService.deleteProfile(profile.id);
    } catch (err) {
      console.error('Error deleting profile:', err);
    }
  }

  async deleteThenNow(profile: ThenNowProfile): Promise<void> {
    if (!this.isAdmin()) return;
    if (!confirm(`Delete Then & Now entry for "${profile.student_name}"?`)) return;
    this.thenNowProfiles.update((list) => list.filter((p) => p.id !== profile.id));
    try {
      await this.supabaseService.deleteThenNowProfile(profile.id);
    } catch (err) {
      console.error('Error deleting then/now profile:', err);
    }
  }

  getInitials(name: string): string {
    if (!name) return 'BHS';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  formatTimestamp(dateStr?: string): string {
    if (!dateStr) return 'Just now';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  getCategoryLabel(category: MessageCategory): string {
    switch (category) {
      case 'thank_you':
        return '🙏 Thank You';
      case 'memory':
        return '💭 Memory';
      case 'prediction_30th':
        return '🔮 30th Prediction';
      default:
        return category;
    }
  }

  getCategoryBadgeClass(category: MessageCategory): string {
    switch (category) {
      case 'thank_you':
        return 'bg-amber-500/20 text-brakke-gold border border-brakke-gold/30';
      case 'memory':
        return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      case 'prediction_30th':
        return 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
      default:
        return 'bg-slate-700 text-slate-300';
    }
  }
}
