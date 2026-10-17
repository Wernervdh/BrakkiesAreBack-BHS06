import { Component, OnDestroy, inject, output, signal } from '@angular/core';
import { ReunionService } from '../../services/reunion.service';
import { UiService } from '../../services/ui.service';
import { friendlyError } from '../../utils/errors';

@Component({
  selector: 'app-then-now-modal',
  standalone: true,
  template: `
    <div class="sheet-backdrop" (click)="close()">
      <div class="sheet" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="tnTitle">
        <div class="flex items-start justify-between pb-4 border-b border-brakke-line">
          <div>
            <h3 id="tnTitle" class="text-lg font-bold text-white">🎭 My Then &amp; Now</h3>
            <p class="text-xs text-slate-400">Your 2006 matric photo next to a selfie from tonight.</p>
          </div>
          <button type="button" class="btn-secondary w-9 h-9 p-0" (click)="close()" aria-label="Close">✕</button>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3">
          @for (slot of slots; track slot.key) {
            <div>
              <p class="text-xs font-bold mb-1.5" [class]="slot.key === 'now' ? 'text-brakke-gold' : 'text-slate-300'">{{ slot.label }}</p>
              <button
                type="button"
                class="relative w-full aspect-square rounded-xl overflow-hidden border-2 border-dashed border-brakke-line hover:border-brakke-gold/60 bg-brakke-deep flex flex-col items-center justify-center text-center p-2 transition"
                (click)="(slot.key === 'then' ? thenInput : nowInput).click()"
              >
                @if (preview(slot.key)) {
                  <img [src]="preview(slot.key)" [alt]="slot.label" class="absolute inset-0 w-full h-full object-cover" />
                  <span class="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded bg-black/80 text-[10px] text-white">Change</span>
                } @else {
                  <span class="text-3xl mb-1">{{ slot.icon }}</span>
                  <span class="text-xs text-slate-300">{{ slot.hint }}</span>
                }
              </button>
            </div>
          }
        </div>
        <input #thenInput type="file" accept="image/*" class="hidden" (change)="onFile('then', $event)" />
        <input #nowInput type="file" accept="image/*" capture="user" class="hidden" (change)="onFile('now', $event)" />

        <p class="text-[11px] text-slate-400 mt-3">Tip: take a photo of your printed matric photo or yearbook page. You can post one entry.</p>

        @if (errorMessage()) {
          <div role="alert" class="mt-3 p-3 bg-brakke-red/15 border border-brakke-red/40 rounded-xl text-red-200 text-sm">{{ errorMessage() }}</div>
        }

        <div class="flex gap-3 pt-4">
          <button type="button" class="btn-secondary flex-1" (click)="close()">Cancel</button>
          <button type="button" class="btn-primary flex-1" [disabled]="uploading() || !thenFile || !nowFile" (click)="submit()">
            @if (uploading()) {
              <span class="w-4 h-4 border-2 border-brakke-deep border-t-transparent rounded-full animate-spin"></span> Uploading…
            } @else {
              Publish
            }
          </button>
        </div>
      </div>
    </div>
  `
})
export class ThenNowModalComponent implements OnDestroy {
  private readonly reunion = inject(ReunionService);
  private readonly ui = inject(UiService);

  readonly closed = output<void>();

  readonly slots = [
    { key: 'then' as const, label: '2006 Matric', icon: '🎓', hint: 'Yearbook / old photo' },
    { key: 'now' as const, label: '2026 Now', icon: '🤳', hint: 'Selfie tonight' }
  ];
  readonly thenPreview = signal<string | null>(null);
  readonly nowPreview = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly errorMessage = signal('');
  thenFile: File | null = null;
  nowFile: File | null = null;

  preview(key: 'then' | 'now'): string | null {
    return key === 'then' ? this.thenPreview() : this.nowPreview();
  }

  onFile(key: 'then' | 'now', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const target = key === 'then' ? this.thenPreview : this.nowPreview;
    const old = target();
    if (old) URL.revokeObjectURL(old);
    target.set(URL.createObjectURL(file));
    if (key === 'then') this.thenFile = file;
    else this.nowFile = file;
    this.errorMessage.set('');
  }

  close(): void {
    if (!this.uploading()) this.closed.emit();
  }

  async submit(): Promise<void> {
    if (!this.thenFile || !this.nowFile) {
      this.errorMessage.set('Please add both photos.');
      return;
    }
    this.uploading.set(true);
    this.errorMessage.set('');
    try {
      await this.reunion.uploadThenNow(this.thenFile, this.nowFile);
      this.ui.success('Your Then & Now is live! 🎭');
      this.closed.emit();
    } catch (err) {
      this.errorMessage.set(friendlyError(err, 'Upload failed. Please try again.'));
    } finally {
      this.uploading.set(false);
    }
  }

  ngOnDestroy(): void {
    for (const url of [this.thenPreview(), this.nowPreview()]) if (url) URL.revokeObjectURL(url);
  }
}
