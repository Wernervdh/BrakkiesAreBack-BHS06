import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { strToU8, zipSync, Zippable } from 'fflate';
import { ReunionService } from '../../services/reunion.service';
import { UiService } from '../../services/ui.service';
import { Photo } from '../../models/reunion.model';
import { friendlyError } from '../../utils/errors';
import { downloadBlob, toCsv } from '../../utils/format';

type Filter = 'all' | 'shortlisted';
type Sort = 'time' | 'hearts';

/**
 * Organisers curate a shortlist of photos and download it as a ZIP
 * (photos + captions.csv with captions and who to tag) to post on Facebook.
 */
@Component({
  selector: 'app-facebook-pack',
  standalone: true,
  template: `
    <div class="min-h-dvh pb-28">
      <header class="sticky top-0 z-40 bg-brakke-navy/90 backdrop-blur-md border-b border-brakke-line">
        <div class="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button type="button" class="btn-secondary px-3 py-2" (click)="router.navigate(['/feed'])">← Back</button>
          <h1 class="text-base font-bold text-white">📘 Facebook pack</h1>
        </div>
      </header>

      <main class="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        <p class="text-sm text-slate-300">
          Tick the photos that should go to Facebook. The shortlist is shared by all organisers. Then download the ZIP:
          it contains the photos plus <strong class="text-white">captions.csv</strong> with each caption and who to tag.
          You can email the ZIP, share it on WhatsApp, or put it on Google Drive for whoever posts to the Facebook group.
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <button type="button" [class]="filter() === 'all' ? 'chip-on' : 'chip-off'" (click)="filter.set('all')">All ({{ photos().length }})</button>
          <button type="button" [class]="filter() === 'shortlisted' ? 'chip-on' : 'chip-off'" (click)="filter.set('shortlisted')">
            ✓ Shortlisted ({{ shortlisted().length }})
          </button>
          <span class="mx-1 text-slate-600">|</span>
          <button type="button" [class]="sort() === 'time' ? 'chip-on' : 'chip-off'" (click)="sort.set('time')">By time</button>
          <button type="button" [class]="sort() === 'hearts' ? 'chip-on' : 'chip-off'" (click)="sort.set('hearts')">By hearts</button>
        </div>

        @if (loading()) {
          <div class="py-16 flex flex-col items-center gap-3 text-slate-400 text-sm"><div class="spinner"></div>Loading photos…</div>
        } @else if (!visible().length) {
          <p class="card p-8 text-center text-slate-400">No photos here yet.</p>
        } @else {
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            @for (photo of visible(); track photo.id) {
              <button
                type="button"
                class="relative rounded-xl overflow-hidden aspect-square bg-black/50 border-2 transition text-left"
                [class]="photo.shortlisted ? 'border-brakke-gold' : 'border-transparent'"
                (click)="toggle(photo)"
                [attr.aria-pressed]="photo.shortlisted"
                [attr.aria-label]="(photo.shortlisted ? 'Remove from shortlist: ' : 'Add to shortlist: ') + 'photo by ' + photo.author_name"
              >
                <img [src]="photo.url" alt="" class="w-full h-full object-cover" loading="lazy" />
                <span
                  class="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-sm font-black border-2"
                  [class]="photo.shortlisted ? 'bg-brakke-gold border-brakke-gold text-brakke-deep' : 'bg-black/60 border-white/70 text-transparent'"
                >✓</span>
                <span class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent text-[11px] text-white">
                  {{ photo.author_name }} · ❤️ {{ photo.likes_count }}
                  @if (photo.tagged_ids.length) { · 🏷️ {{ photo.tagged_ids.length }} }
                </span>
              </button>
            }
          </div>
        }
      </main>

      <div class="fixed bottom-0 inset-x-0 z-40 bg-brakke-navy/95 backdrop-blur-xl border-t border-brakke-line pb-safe">
        <div class="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <p class="flex-1 text-sm text-slate-300">
            @if (progress()) { {{ progress() }} } @else { {{ shortlisted().length }} photo(s) shortlisted }
          </p>
          <button type="button" class="btn-primary" [disabled]="!!progress() || !shortlisted().length" (click)="downloadZip()">
            ⬇️ Download ZIP
          </button>
        </div>
      </div>
    </div>
  `
})
export class FacebookPackComponent implements OnInit {
  readonly router = inject(Router);
  private readonly reunion = inject(ReunionService);
  private readonly ui = inject(UiService);

  readonly photos = signal<Photo[]>([]);
  readonly loading = signal(true);
  readonly filter = signal<Filter>('all');
  readonly sort = signal<Sort>('time');
  readonly progress = signal('');

  readonly shortlisted = computed(() => this.photos().filter((p) => p.shortlisted));
  readonly visible = computed(() => {
    const list = this.filter() === 'shortlisted' ? this.shortlisted() : this.photos();
    return [...list].sort((a, b) =>
      this.sort() === 'hearts' ? b.likes_count - a.likes_count : a.created_at.localeCompare(b.created_at)
    );
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.reunion.start();
      this.photos.set(await this.reunion.fetchAllPhotos());
    } catch (err) {
      this.ui.error(friendlyError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async toggle(photo: Photo): Promise<void> {
    const value = !photo.shortlisted;
    this.setLocal(photo.id, value);
    try {
      await this.reunion.setShortlisted(photo, value);
    } catch (err) {
      this.setLocal(photo.id, !value);
      this.ui.error(friendlyError(err));
    }
  }

  async downloadZip(): Promise<void> {
    const selected = [...this.shortlisted()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const names = new Map(this.reunion.profiles().map((p) => [p.id, p.display_name]));
    const files: Zippable = {};
    const rows: (string | number)[][] = [['File', 'Posted at', 'Author', 'Theme', 'Caption', 'Tag these people', 'Hearts']];

    try {
      for (let i = 0; i < selected.length; i++) {
        const photo = selected[i];
        this.progress.set(`Downloading photo ${i + 1} of ${selected.length}…`);
        const response = await fetch(photo.url);
        if (!response.ok) throw new Error(`Could not download photo by ${photo.author_name}`);
        const file = `${String(i + 1).padStart(3, '0')}_${slug(photo.author_name)}.jpg`;
        files[`photos/${file}`] = [new Uint8Array(await response.arrayBuffer()), { level: 0 }];
        const tagged = photo.tagged_ids.map((id) => names.get(id)).filter(Boolean).join('; ');
        rows.push([file, new Date(photo.created_at).toLocaleString(), photo.author_name, photo.prompt_tag, photo.caption ?? '', tagged, photo.likes_count]);
      }

      this.progress.set('Creating ZIP…');
      files['captions.csv'] = strToU8('﻿' + toCsv(rows));
      files['README.txt'] = strToU8(README);
      const zipped = zipSync(files);
      downloadBlob(`BHS06-facebook-pack-${new Date().toISOString().slice(0, 10)}.zip`, new Blob([zipped], { type: 'application/zip' }));
      this.ui.success('ZIP downloaded.');
    } catch (err) {
      this.ui.error(friendlyError(err, 'Could not create the ZIP. Please try again.'));
    } finally {
      this.progress.set('');
    }
  }

  private setLocal(id: string, value: boolean): void {
    this.photos.update((list) => list.map((p) => (p.id === id ? { ...p, shortlisted: value } : p)));
  }
}

function slug(name: string): string {
  return name.replace(/[^\w-]+/g, '_').replace(/_+/g, '_').slice(0, 40) || 'photo';
}

const README = `BHS Matric 2006 - 20-Year Reunion - Facebook pack
==================================================

photos/       The shortlisted photos, numbered in the order they were taken.
captions.csv  Open in Excel / Google Sheets. For every photo: who took it,
              the caption, and the classmates to tag on Facebook.

Tip: create an album in the class Facebook group, upload the photos,
then copy each caption and tag the people listed in captions.csv.
`;
