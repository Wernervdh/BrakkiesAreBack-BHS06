import { Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReunionService } from '../../../services/reunion.service';
import { SessionService } from '../../../services/session.service';
import { UiService } from '../../../services/ui.service';
import { Photo } from '../../../models/reunion.model';
import { friendlyError } from '../../../utils/errors';
import { timeAgo } from '../../../utils/format';
import { TagListComponent } from '../../shared/tag-list.component';

@Component({
  selector: 'app-photo-feed',
  standalone: true,
  imports: [TagListComponent, RouterLink],
  template: `
    <section class="space-y-4">
      @if (reunion.storyPublished()) {
        <a routerLink="/story" class="block card p-4 border-brakke-gold/50 bg-gradient-to-r from-brakke-gold/15 to-transparent">
          <p class="font-bold text-white">📖 The Story of the Night is here</p>
          <p class="text-xs text-slate-300">Relive the reunion from start to finish →</p>
        </a>
      }
      <div class="flex items-end justify-between">
        <div>
          <h2 class="text-lg font-bold text-white">📸 Paparazzi Wall</h2>
          <p class="text-xs text-slate-400">Live snaps from tonight. Tap a photo to view it full screen.</p>
        </div>
        <span class="text-xs text-slate-400 font-medium shrink-0">{{ reunion.photos().length }}{{ reunion.hasMorePhotos() ? '+' : '' }} photos</span>
      </div>

      @if (reunion.loading() && !reunion.photos().length) {
        <div class="py-16 flex flex-col items-center gap-3 text-slate-400 text-sm">
          <div class="spinner"></div>
          Loading snaps…
        </div>
      } @else if (!reunion.photos().length) {
        <div class="card py-14 px-6 text-center">
          <p class="text-4xl mb-2">📸</p>
          <p class="font-bold text-white">No photos yet</p>
          <p class="text-sm text-slate-400 mt-1 mb-5">Be the first to capture a reunion moment.</p>
          <button type="button" class="btn-primary" (click)="snap.emit()">Take the first photo</button>
        </div>
      } @else {
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          @for (photo of reunion.photos(); track photo.id) {
            <article class="card overflow-hidden">
              <button
                type="button"
                class="relative block w-full aspect-[4/3] bg-black/50 overflow-hidden"
                (click)="viewing.set(photo)"
                [attr.aria-label]="'View photo by ' + photo.author_name"
              >
                <img [src]="photo.url" [alt]="'Photo by ' + photo.author_name" class="w-full h-full object-cover" loading="lazy" decoding="async" />
                <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-black/70 text-brakke-gold border border-brakke-gold/40 backdrop-blur">
                  #{{ photo.prompt_tag }}
                </span>
              </button>

              <div class="p-3.5 space-y-2">
                @if (photo.caption) {
                  <p class="text-sm text-slate-200 break-words">{{ photo.caption }}</p>
                }
                <app-tag-list [ids]="photo.tagged_ids" (untagMe)="untagMe(photo)" />
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-white truncate">
                      {{ photo.author_name }}
                      @if (isMine(photo)) { <span class="text-[10px] font-bold text-brakke-gold ml-1">YOU</span> }
                    </p>
                    <p class="text-[11px] text-slate-400">{{ timeAgo(photo.created_at) }}</p>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    @if (canDelete(photo)) {
                      <button type="button" class="btn-ghost-danger" (click)="remove(photo)" aria-label="Delete photo">🗑️</button>
                    }
                    <button
                      type="button"
                      (click)="like(photo)"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition active:scale-95"
                      [class]="liked(photo) ? 'bg-brakke-red/25 border-brakke-red/60 text-red-200' : 'bg-brakke-surface border-brakke-line text-slate-200 hover:border-brakke-red/50'"
                      [attr.aria-pressed]="liked(photo)"
                      [attr.aria-label]="liked(photo) ? 'Remove heart' : 'Give a heart'"
                    >
                      <span>{{ liked(photo) ? '❤️' : '🤍' }}</span>
                      <span class="text-xs font-bold tabular-nums">{{ photo.likes_count }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          }
        </div>

        @if (reunion.hasMorePhotos()) {
          <div class="flex justify-center pt-2">
            <button type="button" class="btn-secondary" [disabled]="loadingMore()" (click)="loadMore()">
              {{ loadingMore() ? 'Loading…' : 'Load older photos' }}
            </button>
          </div>
        }
      }
    </section>

    @if (viewing(); as photo) {
      <div class="fixed inset-0 z-[60] bg-black/95 flex flex-col" (click)="viewing.set(null)" role="dialog" aria-modal="true">
        <div class="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]" (click)="$event.stopPropagation()">
          <div class="min-w-0">
            <p class="font-semibold text-white truncate">{{ photo.author_name }}</p>
            <p class="text-xs text-slate-400">#{{ photo.prompt_tag }} • {{ timeAgo(photo.created_at) }}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            @if (canDelete(photo)) {
              <a class="btn-secondary px-3 py-2 text-xs" [href]="reunion.downloadUrl(photo.image_path, photo.author_name)" rel="noopener">⬇️ Download</a>
            }
            <button type="button" class="btn-secondary w-10 h-10 p-0" (click)="viewing.set(null)" aria-label="Close">✕</button>
          </div>
        </div>
        <div class="flex-1 flex items-center justify-center p-2 min-h-0">
          <img [src]="photo.url" [alt]="'Photo by ' + photo.author_name" class="max-w-full max-h-full object-contain" />
        </div>
        @if (photo.caption || photo.tagged_ids.length) {
          <div class="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center space-y-1" (click)="$event.stopPropagation()">
            @if (photo.caption) { <p class="text-slate-200 text-sm">{{ photo.caption }}</p> }
            <app-tag-list class="inline-block" [ids]="photo.tagged_ids" (untagMe)="untagMe(photo)" />
          </div>
        }
      </div>
    }
  `
})
export class PhotoFeedComponent {
  readonly reunion = inject(ReunionService);
  private readonly session = inject(SessionService);
  private readonly ui = inject(UiService);

  readonly snap = output<void>();
  readonly viewing = signal<Photo | null>(null);
  readonly loadingMore = signal(false);
  readonly timeAgo = timeAgo;

  private readonly uid = computed(() => this.session.userId());

  isMine(photo: Photo): boolean {
    return photo.owner_id === this.uid();
  }

  canDelete(photo: Photo): boolean {
    return this.isMine(photo) || this.session.isOrganizer();
  }

  liked(photo: Photo): boolean {
    return this.reunion.likedPhotoIds().has(photo.id);
  }

  async like(photo: Photo): Promise<void> {
    try {
      await this.reunion.toggleLike(photo);
    } catch (err) {
      this.ui.error(friendlyError(err));
    }
  }

  async remove(photo: Photo): Promise<void> {
    const ok = await this.ui.confirm({
      title: 'Delete this photo?',
      message: this.isMine(photo)
        ? 'Your photo will be removed for everyone.'
        : `Remove this photo by ${photo.author_name} for everyone?`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    try {
      await this.reunion.deletePhoto(photo);
      if (this.viewing()?.id === photo.id) this.viewing.set(null);
      this.ui.success('Photo deleted.');
    } catch (err) {
      this.ui.error(friendlyError(err));
    }
  }

  async untagMe(photo: Photo): Promise<void> {
    const uid = this.uid();
    if (!uid) return;
    try {
      await this.reunion.removePhotoTag(photo, uid);
      const viewing = this.viewing();
      if (viewing?.id === photo.id) this.viewing.set({ ...viewing, tagged_ids: viewing.tagged_ids.filter((id) => id !== uid) });
      this.ui.toast('Your tag was removed.');
    } catch (err) {
      this.ui.error(friendlyError(err));
    }
  }

  async loadMore(): Promise<void> {
    this.loadingMore.set(true);
    try {
      await this.reunion.loadMorePhotos();
    } catch (err) {
      this.ui.error(friendlyError(err));
    } finally {
      this.loadingMore.set(false);
    }
  }
}
