import { Component, computed, inject, input, output } from '@angular/core';
import { ReunionService } from '../../services/reunion.service';
import { SessionService } from '../../services/session.service';

/** "with Anna, Ben" line under a photo / note, with "Remove my tag" for the tagged guest. */
@Component({
  selector: 'app-tag-list',
  standalone: true,
  template: `
    @if (names().length) {
      <p class="text-xs text-slate-300 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span class="text-slate-400">with</span>
        @for (n of names(); track n.id; let last = $last) {
          <span class="font-semibold" [class]="n.id === me() ? 'text-brakke-gold' : 'text-slate-200'">
            {{ n.id === me() ? 'you' : n.name }}{{ last ? '' : ',' }}
          </span>
        }
        @if (taggedMe()) {
          <button type="button" class="ml-1 text-[11px] text-slate-400 underline underline-offset-2 hover:text-white" (click)="untagMe.emit()">
            remove my tag
          </button>
        }
      </p>
    }
  `
})
export class TagListComponent {
  private readonly reunion = inject(ReunionService);
  private readonly session = inject(SessionService);

  readonly ids = input.required<string[]>();
  readonly untagMe = output<void>();

  readonly me = computed(() => this.session.userId());
  readonly taggedMe = computed(() => this.ids().includes(this.me() ?? ''));
  readonly names = computed(() =>
    this.ids()
      .map((id) => ({ id, name: this.reunion.profiles().find((p) => p.id === id)?.display_name }))
      .filter((n): n is { id: string; name: string } => !!n.name)
  );
}
