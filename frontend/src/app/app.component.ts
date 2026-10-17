import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <main class="min-h-screen bg-[#070f1e] text-slate-100 flex flex-col font-sans">
      <router-outlet></router-outlet>
    </main>
  `
})
export class AppComponent {
  title = "'06 BrakkiesAreBack BHS";
}
