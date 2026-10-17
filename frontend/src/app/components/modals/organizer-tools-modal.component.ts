import { Component, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ReunionService } from '../../services/reunion.service';
import { UiService } from '../../services/ui.service';
import { friendlyError } from '../../utils/errors';
import { downloadText, toCsv } from '../../utils/format';

@Component({
  selector: 'app-organizer-tools-modal',
  standalone: true,
  template: `
    <div class="sheet-backdrop" (click)="closed.emit()">
      <div class="sheet space-y-5" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="toolsTitle">
        <div>
          <h3 id="toolsTitle" class="text-lg font-bold text-white">🛡️ Organiser tools</h3>
          <p class="text-sm text-slate-400 mt-1">
            You can delete any photo or note (🗑️), and remove guests or grant organiser rights in Who's Here.
          </p>
        </div>

        <section class="card p-4 space-y-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="font-bold text-white">📖 The Story</p>
              <p class="text-xs text-slate-400">
                {{ reunion.storyPublished() ? 'Published: everyone can see it.' : 'Hidden: only organisers can preview it.' }}
              </p>
            </div>
            <button
              type="button"
              [class]="reunion.storyPublished() ? 'btn-secondary' : 'btn-primary'"
              class="shrink-0 px-3 py-2 text-xs"
              [disabled]="busy()"
              (click)="toggleStory()"
            >
              {{ reunion.storyPublished() ? 'Hide' : 'Publish' }}
            </button>
          </div>
          <button type="button" class="btn-secondary w-full text-xs" (click)="openStory()">Preview the Story</button>
        </section>

        <section class="card p-4 space-y-2">
          <p class="font-bold text-white">📘 Facebook pack</p>
          <p class="text-xs text-slate-400">Shortlist photos, then download them as a ZIP with captions and who to tag.</p>
          <button type="button" class="btn-primary w-full text-xs" (click)="go('/organiser/facebook')">Open Facebook pack</button>
        </section>

        <section class="card p-4 space-y-3">
          <p class="font-bold text-white">⬇️ Export (CSV for Excel / Google Sheets)</p>
          <div class="grid gap-2">
            <button type="button" class="btn-secondary text-xs" [disabled]="busy()" (click)="exportGuests()">Guest list</button>
            <button type="button" class="btn-secondary text-xs" [disabled]="busy()" (click)="exportNotes()">Time Capsule notes</button>
            <button type="button" class="btn-secondary text-xs" [disabled]="busy()" (click)="exportPhotos()">Photo list with download links</button>
          </div>
          <p class="text-[11px] text-slate-400">
            To save a single photo in full size, open it in the Paparazzi wall and tap Download.
            To download all photos at once, use the Supabase dashboard (Storage → reunion-media).
          </p>
        </section>

        <button type="button" class="btn-secondary w-full" (click)="closed.emit()">Close</button>
      </div>
    </div>
  `
})
export class OrganizerToolsModalComponent {
  readonly reunion = inject(ReunionService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  readonly closed = output<void>();
  readonly busy = signal(false);

  async toggleStory(): Promise<void> {
    const publish = !this.reunion.storyPublished();
    const ok = await this.ui.confirm({
      title: publish ? 'Publish the Story?' : 'Hide the Story?',
      message: publish
        ? 'Every guest will see the Story: all photos and notes in the order they were posted.'
        : 'Guests will no longer see the Story. Organisers can still preview it.',
      confirmLabel: publish ? 'Publish' : 'Hide'
    });
    if (!ok) return;
    await this.run(async () => {
      await this.reunion.setStoryPublished(publish);
      this.ui.success(publish ? 'The Story is now live. 📖' : 'The Story is hidden.');
    });
  }

  openStory(): void {
    this.go('/story');
  }

  go(path: string): void {
    this.closed.emit();
    void this.router.navigate([path]);
  }

  exportGuests(): Promise<void> {
    return this.run(async () => {
      const rows = this.reunion.profiles().map((p) => [p.display_name, p.is_organizer ? 'yes' : '', p.created_at]);
      downloadText(`bhs06-guests-${stamp()}.csv`, toCsv([['Name', 'Organiser', 'Checked in at'], ...rows]));
    });
  }

  exportNotes(): Promise<void> {
    return this.run(async () => {
      const names = this.nameLookup();
      const rows = [...this.reunion.messages()]
        .reverse()
        .map((m) => [m.created_at, m.category, m.author_name, m.content, m.tagged_ids.map(names).join('; ')]);
      downloadText(`bhs06-notes-${stamp()}.csv`, toCsv([['Posted at', 'Category', 'Author', 'Note', 'Tagged'], ...rows]));
    });
  }

  exportPhotos(): Promise<void> {
    return this.run(async () => {
      const names = this.nameLookup();
      const photos = await this.reunion.fetchAllPhotos();
      const rows = photos.map((p) => [
        p.created_at,
        p.author_name,
        p.prompt_tag,
        p.caption ?? '',
        p.likes_count,
        p.tagged_ids.map(names).join('; '),
        p.url
      ]);
      downloadText(
        `bhs06-photos-${stamp()}.csv`,
        toCsv([['Posted at', 'Author', 'Theme', 'Caption', 'Hearts', 'Tagged', 'Link'], ...rows])
      );
    });
  }

  private nameLookup(): (id: string) => string {
    const map = new Map(this.reunion.profiles().map((p) => [p.id, p.display_name]));
    return (id) => map.get(id) ?? '';
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await task();
    } catch (err) {
      this.ui.error(friendlyError(err));
    } finally {
      this.busy.set(false);
    }
  }
}

function stamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}
