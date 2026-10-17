import { Component } from '@angular/core';
import { CrestComponent } from '../shared/crest.component';

/** Shown on every page while APP_CLOSED is true. Makes no network calls. */
@Component({
  selector: 'app-closed',
  standalone: true,
  imports: [CrestComponent],
  template: `
    <div class="relative min-h-dvh flex flex-col items-center justify-center px-6 py-12 overflow-hidden text-center">
      <div class="absolute inset-0 crest-stripes pointer-events-none"></div>
      <div class="relative max-w-md flex flex-col items-center gap-4">
        <app-crest [size]="104" />
        <h1 class="text-3xl font-extrabold tracking-tight text-white">
          '06 <span class="text-brakke-gold">BrakkiesAreBack</span>
        </h1>
        <p class="text-slate-300">Matric 2006 • 20-Year Reunion</p>

        <section class="card p-6 mt-2 space-y-3">
          <p class="text-lg font-bold text-white">Die app is tans gesluit 🔒</p>
          <p class="text-sm text-slate-300">Dankie aan almal wat ingeteken het! Hou die klas-groep dop vir nuus.</p>
          <hr class="border-brakke-line" />
          <p class="text-lg font-bold text-white">The app is closed for now 🔒</p>
          <p class="text-sm text-slate-300">Thanks to everyone who checked in! Keep an eye on the class group for news.</p>
        </section>
      </div>
    </div>
  `
})
export class ClosedComponent {}
