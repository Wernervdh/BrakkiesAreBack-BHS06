import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiOverlayComponent } from './components/shared/ui-overlay.component';
import { ClosedComponent } from './components/closed/closed.component';
import { APP_CLOSED } from './app-status';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, UiOverlayComponent, ClosedComponent],
  template: `
    <div class="min-h-dvh bg-brakke-deep text-slate-100 flex flex-col">
      @if (closed) {
        <app-closed />
      } @else {
        <router-outlet />
      }
    </div>
    <app-ui-overlay />
  `
})
export class AppComponent {
  /** See app-status.ts. While closed no route (and so no guard or Supabase call) is ever activated. */
  readonly closed = APP_CLOSED;
}
