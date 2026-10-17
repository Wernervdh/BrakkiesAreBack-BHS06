import { Component, input } from '@angular/core';

/** School crest (public/crest.svg). */
@Component({
  selector: 'app-crest',
  standalone: true,
  template: `
    <img
      src="crest.svg"
      alt="Brackenfell High School crest"
      [style.width.px]="size()"
      [style.height.px]="size()"
      class="object-contain drop-shadow-lg select-none"
      draggable="false"
    />
  `
})
export class CrestComponent {
  readonly size = input(48);
}
