import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PHOTO_PROMPTS, PhotoPrompt } from '../../models/reunion.model';

@Component({
  selector: 'app-photo-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div
        class="w-full sm:max-w-lg bg-[#0f1d38] border border-brakke-gold/25 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        (click)="$event.stopPropagation()"
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between pb-4 border-b border-slate-700/60">
          <div>
            <h3 class="text-lg font-bold text-white flex items-center gap-2">
              @if (selectedPrompt === 'Then & Now') {
                <span>🎭 Then & Now Matcher</span>
              } @else {
                <span>📸 Paparazzi Snap</span>
              }
            </h3>
            <p class="text-xs text-slate-400">
              @if (selectedPrompt === 'Then & Now') {
                Upload your 2006 Matric photo and your 2026 reunion selfie!
              } @else {
                Share live snapshots instantly with the whole room
              }
            </p>
          </div>
          <button
            (click)="close.emit()"
            class="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold"
          >
            ✕
          </button>
        </div>

        <form (ngSubmit)="submitPhoto()" class="mt-4 space-y-4">
          <!-- Prompt selector -->
          <div>
            <label for="promptSelect" class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Select a Prompt / Theme *
            </label>
            <select
              id="promptSelect"
              [(ngModel)]="selectedPrompt"
              name="promptSelect"
              (change)="onPromptChange()"
              class="w-full px-4 py-3 bg-[#0a192f] border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-brakke-gold text-sm font-semibold"
            >
              @for (prompt of promptOptions; track prompt) {
                <option [value]="prompt">#{{ prompt }}</option>
              }
            </select>
          </div>

          <!-- ========================================== -->
          <!-- MODE 1: THEN & NOW DUAL PHOTO UPLOADER     -->
          <!-- ========================================== -->
          @if (selectedPrompt === 'Then & Now') {
            <div class="space-y-4 p-4 rounded-2xl bg-[#0a192f]/70 border border-brakke-gold/25">
              <div class="text-center pb-1">
                <span class="text-xs font-bold text-brakke-gold uppercase tracking-wider">
                  Side-By-Side Comparison
                </span>
                <p class="text-[11px] text-slate-400">Add both photos to enter the "Most Changed" contest!</p>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <!-- 1. 2006 Matric Photo -->
                <div>
                  <label class="block text-[11px] font-bold text-slate-300 mb-1">
                    1. 2006 Matric Photo *
                  </label>
                  @if (yearbookPreviewUrl()) {
                    <div class="relative w-full aspect-square rounded-xl overflow-hidden border border-slate-600 bg-black/40">
                      <img [src]="yearbookPreviewUrl()" alt="2006" class="w-full h-full object-cover" />
                      <button
                        type="button"
                        (click)="yearbookFile = null; yearbookPreviewUrl.set(null)"
                        class="absolute top-1 right-1 px-2 py-0.5 bg-black/80 text-[10px] text-white rounded-md"
                      >
                        Change
                      </button>
                    </div>
                  } @else {
                    <div
                      class="border-2 border-dashed border-slate-700 hover:border-brakke-gold/60 rounded-xl aspect-square flex flex-col items-center justify-center p-2 text-center cursor-pointer bg-[#070f1e]"
                      (click)="yearbookInput.click()"
                    >
                      <span class="text-2xl mb-1">🎓</span>
                      <span class="text-[11px] font-semibold text-slate-300">2006 Photo</span>
                      <span class="text-[9px] text-slate-500">Yearbook / Old</span>
                    </div>
                  }
                  <input
                    #yearbookInput
                    type="file"
                    accept="image/*"
                    class="hidden"
                    (change)="onYearbookSelected($event)"
                  />
                </div>

                <!-- 2. 2026 Reunion Selfie -->
                <div>
                  <label class="block text-[11px] font-bold text-brakke-gold mb-1">
                    2. 2026 Selfie *
                  </label>
                  @if (currentPreviewUrl()) {
                    <div class="relative w-full aspect-square rounded-xl overflow-hidden border border-brakke-gold/50 bg-black/40">
                      <img [src]="currentPreviewUrl()" alt="2026" class="w-full h-full object-cover" />
                      <button
                        type="button"
                        (click)="currentFile = null; currentPreviewUrl.set(null)"
                        class="absolute top-1 right-1 px-2 py-0.5 bg-black/80 text-[10px] text-white rounded-md"
                      >
                        Change
                      </button>
                    </div>
                  } @else {
                    <div
                      class="border-2 border-dashed border-brakke-gold/40 hover:border-brakke-gold rounded-xl aspect-square flex flex-col items-center justify-center p-2 text-center cursor-pointer bg-[#070f1e]"
                      (click)="currentInput.click()"
                    >
                      <span class="text-2xl mb-1">🤳</span>
                      <span class="text-[11px] font-semibold text-brakke-gold">2026 Photo</span>
                      <span class="text-[9px] text-slate-400">Live Selfie / Now</span>
                    </div>
                  }
                  <input
                    #currentInput
                    type="file"
                    accept="image/*"
                    capture="environment"
                    class="hidden"
                    (change)="onCurrentSelected($event)"
                  />
                </div>
              </div>
            </div>
          } @else {
            <!-- ========================================== -->
            <!-- MODE 2: STANDARD SINGLE PHOTO SNAPPER      -->
            <!-- ========================================== -->
            <div>
              <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Photo Selection / Camera *
              </label>

              @if (previewUrl()) {
                <div class="relative w-full h-64 rounded-2xl overflow-hidden border border-brakke-gold/30 bg-black/40 mb-3">
                  <img [src]="previewUrl()" alt="Preview" class="w-full h-full object-contain" />
                  <button
                    type="button"
                    (click)="clearPreview()"
                    class="absolute top-2 right-2 px-3 py-1 bg-black/70 hover:bg-black/90 text-white text-xs rounded-full backdrop-blur-md"
                  >
                    Choose Different
                  </button>
                </div>
              } @else {
                <div
                  class="border-2 border-dashed border-slate-700 hover:border-brakke-gold/60 rounded-2xl p-6 text-center cursor-pointer bg-[#0a192f]/50 hover:bg-[#0a192f] transition"
                  (click)="fileInput.click()"
                >
                  <div class="text-4xl mb-2">📷</div>
                  <p class="text-sm font-medium text-slate-200">Tap to take a photo or select from gallery</p>
                  <p class="text-xs text-slate-500 mt-1">Launches camera directly on mobile phones</p>
                </div>
              }

              <input
                #fileInput
                type="file"
                accept="image/*"
                capture="environment"
                class="hidden"
                (change)="onFileSelected($event)"
              />
            </div>
          }

          <!-- Author name confirmation -->
          <div>
            <label for="authorInput" class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Your Name (for photo credit) *
            </label>
            <input
              id="authorInput"
              type="text"
              [(ngModel)]="authorName"
              name="authorInput"
              required
              class="w-full px-4 py-3 bg-[#0a192f] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brakke-gold text-sm"
            />
          </div>

          @if (errorMessage()) {
            <div class="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
              {{ errorMessage() }}
            </div>
          }

          <div class="pt-2 flex gap-3">
            <button
              type="button"
              (click)="close.emit()"
              class="flex-1 py-3 px-4 rounded-xl font-medium text-sm bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              [disabled]="uploading() || isSubmitDisabled()"
              class="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-brakke-gold to-brakke-goldDark text-slate-950 shadow-md shadow-brakke-gold/20 hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              @if (uploading()) {
                <span class="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                <span>Uploading...</span>
              } @else {
                <span>
                  {{ selectedPrompt === 'Then & Now' ? 'Publish Comparison 🎭' : 'Post Photo 🚀' }}
                </span>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class PhotoModalComponent {
  @Input() authorName = '';
  @Output() close = new EventEmitter<void>();
  @Output() photoUploaded = new EventEmitter<{ file: File; author_name: string; prompt_tag: string }>();

  promptOptions = PHOTO_PROMPTS;
  selectedPrompt: PhotoPrompt = 'Mid-laugh';
  @Input() initialPrompt: PhotoPrompt = 'Mid-laugh';
  @Output() thenNowUploaded = new EventEmitter<{ student_name: string; yearbook_file: File; current_file: File }>();

  // Single photo mode
  selectedFile: File | null = null;
  previewUrl = signal<string | null>(null);

  // Dual photo mode (Then & Now)
  yearbookFile: File | null = null;
  yearbookPreviewUrl = signal<string | null>(null);
  currentFile: File | null = null;
  currentPreviewUrl = signal<string | null>(null);

  uploading = signal(false);
  errorMessage = signal('');

  ngOnInit(): void {
    if (this.initialPrompt) {
      this.selectedPrompt = this.initialPrompt;
    }
  }

  onPromptChange(): void {
    this.errorMessage.set('');
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        this.previewUrl.set(e.target?.result as string);
      };
      reader.readAsDataURL(this.selectedFile);
    }
  }

  clearPreview(): void {
    this.selectedFile = null;
    this.previewUrl.set(null);
  }

  onYearbookSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.yearbookFile = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => this.yearbookPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(this.yearbookFile);
    }
  }

  onCurrentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.currentFile = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => this.currentPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(this.currentFile);
    }
  }

  isSubmitDisabled(): boolean {
    if (!this.authorName.trim()) return true;
    if (this.selectedPrompt === 'Then & Now') {
      return !this.yearbookFile || !this.currentFile;
    }
    return !this.selectedFile;
  }

  submitPhoto(): void {
    if (!this.authorName.trim()) {
      this.errorMessage.set('Please enter your name.');
      return;
    }

    if (this.selectedPrompt === 'Then & Now') {
      if (!this.yearbookFile || !this.currentFile) {
        this.errorMessage.set('Please select both your 2006 photo and your 2026 selfie.');
        return;
      }
      this.uploading.set(true);
      this.thenNowUploaded.emit({
        student_name: this.authorName.trim(),
        yearbook_file: this.yearbookFile,
        current_file: this.currentFile
      });
    } else {
      if (!this.selectedFile) {
        this.errorMessage.set('Please select or capture a photo first.');
        return;
      }
      this.uploading.set(true);
      this.photoUploaded.emit({
        file: this.selectedFile,
        author_name: this.authorName.trim(),
        prompt_tag: this.selectedPrompt
      });
    }
  }
}
