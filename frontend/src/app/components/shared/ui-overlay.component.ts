import { Component, inject } from '@angular/core';
import { UiService } from '../../services/ui.service';

/** Renders toasts and the confirmation dialog requested through UiService. */
@Component({
  selector: 'app-ui-overlay',
  standalone: true,
  template: `
    <div class="fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
      @for (t of ui.toasts(); track t.id) {
        <button
          type="button"
          (click)="ui.dismiss(t.id)"
          class="pointer-events-auto max-w-md w-full text-left px-4 py-3 rounded-2xl text-sm font-medium shadow-xl border backdrop-blur-md"
          [class]="t.kind === 'error'
            ? 'bg-brakke-red/90 border-red-300/30 text-white'
            : t.kind === 'success'
              ? 'bg-emerald-600/90 border-emerald-300/30 text-white'
              : 'bg-brakke-card/95 border-brakke-line text-slate-100'"
        >
          {{ t.text }}
        </button>
      }
    </div>

    @if (ui.confirmRequest(); as req) {
      <div class="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" (click)="req.resolve('cancel')">
        <div
          role="alertdialog"
          aria-modal="true"
          class="w-full max-w-sm card p-6 text-center space-y-4 bg-brakke-navy"
          (click)="$event.stopPropagation()"
        >
          <h3 class="text-base font-bold text-white">{{ req.title }}</h3>
          <p class="text-sm text-slate-300 leading-relaxed whitespace-pre-line text-left">{{ req.message }}</p>
          @if (req.alternativeLabel) {
            <div class="flex flex-col gap-2.5 pt-2">
              <button type="button" class="btn-primary w-full" (click)="req.resolve('alternative')">{{ req.alternativeLabel }}</button>
              <button type="button" class="w-full" [class]="req.danger ? 'btn-danger' : 'btn-secondary'" (click)="req.resolve('confirm')">
                {{ req.confirmLabel }}
              </button>
              <button type="button" class="btn-secondary w-full" (click)="req.resolve('cancel')">Cancel</button>
            </div>
          } @else {
            <div class="flex gap-3 pt-2">
              <button type="button" class="btn-secondary flex-1" (click)="req.resolve('cancel')">Cancel</button>
              <button
                type="button"
                class="flex-1"
                [class]="req.danger ? 'btn-danger' : 'btn-primary'"
                (click)="req.resolve('confirm')"
              >
                {{ req.confirmLabel }}
              </button>
            </div>
          }
        </div>
      </div>
    }
  `
})
export class UiOverlayComponent {
  readonly ui = inject(UiService);
}
