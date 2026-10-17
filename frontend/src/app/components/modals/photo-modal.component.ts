import { Component, OnDestroy, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReunionService } from '../../services/reunion.service';
import { SessionService } from '../../services/session.service';
import { CAPTION_MAX_LENGTH, PHOTO_PROMPTS, PhotoPrompt } from '../../models/reunion.model';
import { friendlyError } from '../../utils/errors';
import { TagPickerComponent } from '../shared/tag-picker.component';

@Component({
  selector: 'app-photo-modal',
  standalone: true,
  imports: [FormsModule, TagPickerComponent],
  template: `
    <div class="sheet-backdrop" (click)="close()">
      <div class="sheet" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="photoTitle">
        <div class="flex items-start justify-between pb-4 border-b border-brakke-line">
          <div>
            <h3 id="photoTitle" class="text-lg font-bold text-white">📸 Paparazzi Snap</h3>
            <p class="text-xs text-slate-400">Posting as <span class="text-brakke-gold font-semibold">{{ session.profile()?.display_name }}</span></p>
          </div>
          <button type="button" class="btn-secondary w-9 h-9 p-0" (click)="close()" aria-label="Close">✕</button>
        </div>

        <form (ngSubmit)="submit()" class="mt-4 space-y-4">
          @if (previewUrl()) {
            <div class="relative w-full h-64 rounded-2xl overflow-hidden border border-brakke-line bg-black/40">
              <img [src]="previewUrl()" alt="Preview" class="w-full h-full object-contain" />
              <button type="button" class="absolute top-2 right-2 btn-secondary px-3 py-1.5 text-xs" (click)="clear()">Choose another</button>
            </div>
          } @else {
            <div class="grid grid-cols-2 gap-3">
              <button type="button" class="card py-6 flex flex-col items-center gap-1 hover:border-brakke-gold/60 transition" (click)="camera.click()">
                <span class="text-3xl">📷</span>
                <span class="text-sm font-semibold text-white">Take photo</span>
              </button>
              <button type="button" class="card py-6 flex flex-col items-center gap-1 hover:border-brakke-gold/60 transition" (click)="gallery.click()">
                <span class="text-3xl">🖼️</span>
                <span class="text-sm font-semibold text-white">From gallery</span>
              </button>
            </div>
          }
          <input #camera type="file" accept="image/*" capture="environment" class="hidden" (change)="onFile($event)" />
          <input #gallery type="file" accept="image/*" class="hidden" (change)="onFile($event)" />

          <div>
            <span class="label">Theme</span>
            <div class="flex flex-wrap gap-2">
              @for (p of prompts; track p) {
                <button type="button" [class]="prompt() === p ? 'chip-on' : 'chip-off'" (click)="prompt.set(p)">#{{ p }}</button>
              }
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <label for="caption" class="label mb-0">Caption <span class="normal-case font-normal text-slate-400">(optional)</span></label>
              <span class="text-[11px] text-slate-400 tabular-nums">{{ caption.length }}/{{ captionMax }}</span>
            </div>
            <input id="caption" name="caption" class="input" [(ngModel)]="caption" [maxlength]="captionMax" placeholder="Say something about this moment" />
          </div>

          <app-tag-picker [(selected)]="tags" />

          @if (errorMessage()) {
            <div role="alert" class="p-3 bg-brakke-red/15 border border-brakke-red/40 rounded-xl text-red-200 text-sm">{{ errorMessage() }}</div>
          }

          <div class="flex gap-3 pt-1">
            <button type="button" class="btn-secondary flex-1" (click)="close()">Cancel</button>
            <button type="submit" class="btn-primary flex-1" [disabled]="uploading() || !file">
              @if (uploading()) {
                <span class="w-4 h-4 border-2 border-brakke-deep border-t-transparent rounded-full animate-spin"></span> Uploading…
              } @else {
                Post photo
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class PhotoModalComponent implements OnDestroy {
  readonly session = inject(SessionService);
  private readonly reunion = inject(ReunionService);

  readonly closed = output<void>();
  readonly posted = output<void>();

  readonly prompts = PHOTO_PROMPTS;
  readonly captionMax = CAPTION_MAX_LENGTH;
  readonly prompt = signal<PhotoPrompt>('Mid-laugh');
  readonly previewUrl = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly errorMessage = signal('');
  file: File | null = null;
  caption = '';
  tags: string[] = [];

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.clear();
    this.file = file;
    this.previewUrl.set(URL.createObjectURL(file));
    this.errorMessage.set('');
  }

  clear(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
    this.file = null;
  }

  close(): void {
    if (!this.uploading()) this.closed.emit();
  }

  async submit(): Promise<void> {
    if (!this.file) {
      this.errorMessage.set('Please take or choose a photo first.');
      return;
    }
    this.uploading.set(true);
    this.errorMessage.set('');
    try {
      await this.reunion.uploadPhoto(this.file, this.prompt(), this.caption, this.tags);
      this.posted.emit();
    } catch (err) {
      this.errorMessage.set(friendlyError(err, 'Upload failed. Please try again.'));
    } finally {
      this.uploading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.clear();
  }
}
