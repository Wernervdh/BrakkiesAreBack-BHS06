import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageCategory } from '../../models/reunion.model';

@Component({
  selector: 'app-message-modal',
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
              ✍️ New Message / Time Capsule
            </h3>
            <p class="text-xs text-slate-400">Post on the Wall of Fame for everyone to see</p>
          </div>
          <button
            (click)="close.emit()"
            class="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold"
          >
            ✕
          </button>
        </div>

        <form (ngSubmit)="submitMessage()" class="mt-4 space-y-4">
          <!-- Category Selector (Pills) -->
          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Category *
            </label>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                (click)="selectedCategory = 'thank_you'"
                [class]="selectedCategory === 'thank_you'
                  ? 'bg-amber-500/20 border-brakke-gold text-brakke-gold'
                  : 'bg-[#0a192f] border-slate-700 text-slate-400 hover:text-slate-200'"
                class="py-2.5 px-2 rounded-xl text-xs font-semibold border transition text-center"
              >
                🙏 Thank You
              </button>

              <button
                type="button"
                (click)="selectedCategory = 'memory'"
                [class]="selectedCategory === 'memory'
                  ? 'bg-blue-500/20 border-blue-400 text-blue-300'
                  : 'bg-[#0a192f] border-slate-700 text-slate-400 hover:text-slate-200'"
                class="py-2.5 px-2 rounded-xl text-xs font-semibold border transition text-center"
              >
                💭 Memory
              </button>

              <button
                type="button"
                (click)="selectedCategory = 'prediction_30th'"
                [class]="selectedCategory === 'prediction_30th'
                  ? 'bg-purple-500/20 border-purple-400 text-purple-300'
                  : 'bg-[#0a192f] border-slate-700 text-slate-400 hover:text-slate-200'"
                class="py-2.5 px-2 rounded-xl text-xs font-semibold border transition text-center"
              >
                🔮 30th Prediction
              </button>
            </div>
          </div>

          <!-- Content Textarea -->
          <div>
            <div class="flex justify-between items-center mb-1">
              <label for="msgContent" class="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Your Note / Story *
              </label>
              <span class="text-[11px] font-mono" [class]="content.length > 450 ? 'text-amber-400 font-bold' : 'text-slate-400'">
                {{ content.length }}/500
              </span>
            </div>
            <textarea
              id="msgContent"
              [(ngModel)]="content"
              name="msgContent"
              rows="4"
              maxlength="500"
              required
              placeholder="Share a 2006 memory, thank the WhatsApp organizers, or make a wild prediction for the 30th..."
              class="w-full px-4 py-3 bg-[#0a192f] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brakke-gold text-sm resize-none"
            ></textarea>
          </div>

          <!-- Author input -->
          <div>
            <label for="msgAuthor" class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Your Name *
            </label>
            <input
              id="msgAuthor"
              type="text"
              [(ngModel)]="authorName"
              name="msgAuthor"
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
              [disabled]="submitting() || !content.trim() || !authorName.trim()"
              class="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-brakke-gold to-brakke-goldDark text-slate-950 shadow-md shadow-brakke-gold/20 hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              @if (submitting()) {
                <span class="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                <span>Posting...</span>
              } @else {
                <span>Post Note 📌</span>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class MessageModalComponent {
  @Input() authorName = '';
  @Output() close = new EventEmitter<void>();
  @Output() messagePosted = new EventEmitter<{ author_name: string; content: string; category: MessageCategory }>();

  selectedCategory: MessageCategory = 'thank_you';
  content = '';
  submitting = signal(false);
  errorMessage = signal('');

  submitMessage(): void {
    if (!this.content.trim()) {
      this.errorMessage.set('Please write a message first.');
      return;
    }
    if (!this.authorName.trim()) {
      this.errorMessage.set('Please enter your name.');
      return;
    }

    this.submitting.set(true);
    this.messagePosted.emit({
      author_name: this.authorName.trim(),
      content: this.content.trim(),
      category: this.selectedCategory
    });
  }
}
