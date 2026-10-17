import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReunionService } from '../../services/reunion.service';
import { SessionService } from '../../services/session.service';
import { UiService } from '../../services/ui.service';
import { MESSAGE_CATEGORIES, MESSAGE_MAX_LENGTH, MessageCategory } from '../../models/reunion.model';
import { friendlyError } from '../../utils/errors';
import { TagPickerComponent } from '../shared/tag-picker.component';

const PLACEHOLDERS: Record<MessageCategory, string> = {
  thank_you: 'Thank the organisers for bringing everyone back together…',
  memory: 'Remember the matric dance? The tuck shop? Share a 2006 memory…',
  prediction_30th: 'By the 30th reunion, I predict that…'
};

@Component({
  selector: 'app-message-modal',
  standalone: true,
  imports: [FormsModule, TagPickerComponent],
  template: `
    <div class="sheet-backdrop" (click)="close()">
      <div class="sheet" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="msgTitle">
        <div class="flex items-start justify-between pb-4 border-b border-brakke-line">
          <div>
            <h3 id="msgTitle" class="text-lg font-bold text-white">✍️ Write a note</h3>
            <p class="text-xs text-slate-400">Posting as <span class="text-brakke-gold font-semibold">{{ session.profile()?.display_name }}</span></p>
          </div>
          <button type="button" class="btn-secondary w-9 h-9 p-0" (click)="close()" aria-label="Close">✕</button>
        </div>

        <form (ngSubmit)="submit()" class="mt-4 space-y-4">
          <div class="grid grid-cols-3 gap-2">
            @for (c of categories; track c.value) {
              <button
                type="button"
                (click)="category.set(c.value)"
                class="py-2.5 px-2 rounded-xl text-xs font-semibold border transition text-center"
                [class]="category() === c.value ? 'bg-brakke-gold/15 border-brakke-gold text-brakke-gold' : 'bg-brakke-deep border-brakke-line text-slate-400 hover:text-slate-200'"
              >
                {{ c.icon }} {{ c.label }}
              </button>
            }
          </div>

          <div>
            <div class="flex justify-between items-center mb-2">
              <label for="msgContent" class="label mb-0">Your note</label>
              <span class="text-[11px] tabular-nums" [class]="content.length > maxLength - 50 ? 'text-amber-400 font-bold' : 'text-slate-400'">
                {{ content.length }}/{{ maxLength }}
              </span>
            </div>
            <textarea
              id="msgContent"
              name="msgContent"
              rows="5"
              class="input resize-none"
              [(ngModel)]="content"
              [maxlength]="maxLength"
              [placeholder]="placeholder()"
            ></textarea>
          </div>

          <app-tag-picker [(selected)]="tags" />

          @if (errorMessage()) {
            <div role="alert" class="p-3 bg-brakke-red/15 border border-brakke-red/40 rounded-xl text-red-200 text-sm">{{ errorMessage() }}</div>
          }

          <div class="flex gap-3 pt-1">
            <button type="button" class="btn-secondary flex-1" (click)="close()">Cancel</button>
            <button type="submit" class="btn-primary flex-1" [disabled]="submitting() || !content.trim()">
              {{ submitting() ? 'Posting…' : 'Post note' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class MessageModalComponent implements OnInit {
  readonly session = inject(SessionService);
  private readonly reunion = inject(ReunionService);
  private readonly ui = inject(UiService);

  readonly initialCategory = input<MessageCategory>('thank_you');
  readonly closed = output<void>();

  readonly categories = MESSAGE_CATEGORIES;
  readonly maxLength = MESSAGE_MAX_LENGTH;
  readonly category = signal<MessageCategory>('thank_you');
  readonly submitting = signal(false);
  readonly errorMessage = signal('');
  content = '';
  tags: string[] = [];

  ngOnInit(): void {
    this.category.set(this.initialCategory());
  }

  placeholder(): string {
    return PLACEHOLDERS[this.category()];
  }

  close(): void {
    if (!this.submitting()) this.closed.emit();
  }

  async submit(): Promise<void> {
    if (!this.content.trim()) {
      this.errorMessage.set('Please write something first.');
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set('');
    try {
      await this.reunion.postMessage(this.content, this.category(), this.tags);
      this.ui.success('Note posted! 📌');
      this.closed.emit();
    } catch (err) {
      this.errorMessage.set(friendlyError(err, 'Could not post your note. Please try again.'));
    } finally {
      this.submitting.set(false);
    }
  }
}
