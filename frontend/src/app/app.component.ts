import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiOverlayComponent } from './components/shared/ui-overlay.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, UiOverlayComponent],
  template: `
    <div class="min-h-dvh bg-brakke-deep text-slate-100 flex flex-col">
      <router-outlet />
    </div>
    <app-ui-overlay />
  `
})
export class AppComponent {}
