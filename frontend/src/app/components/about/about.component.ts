import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { SessionService } from '../../services/session.service';
import { CrestComponent } from '../shared/crest.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CrestComponent],
  template: `
    <div class="min-h-dvh">
      <header class="sticky top-0 z-40 bg-brakke-navy/90 backdrop-blur-md border-b border-brakke-line">
        <div class="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button type="button" (click)="back()" class="btn-secondary px-3 py-2" aria-label="Back">
            ← Back
          </button>
          <h1 class="text-base font-bold text-white">About &amp; how it works</h1>
        </div>
      </header>

      <main class="max-w-2xl mx-auto px-5 py-8 space-y-6 text-slate-300 text-[15px] leading-relaxed">
        <section class="flex flex-col items-center text-center gap-3">
          <app-crest [size]="88" />
          <h2 class="text-2xl font-extrabold text-white">'06 <span class="text-brakke-gold">BrakkiesAreBack</span></h2>
          <p class="text-slate-400 text-sm">Brackenfell High School • Matric 2006 • 20-Year Reunion</p>
        </section>

        <section class="card p-5 space-y-3">
          <h3 class="text-lg font-bold text-white">What is this app?</h3>
          <p>
            This is the reunion's shared photo wall and guest book. Twenty years after matric, it gives everyone at
            the reunion one place to capture the night together. Everything you post appears live on everyone's phone.
          </p>
          <ul class="space-y-2">
            <li><strong class="text-white">📸 Paparazzi:</strong> snap photos during the evening and give your favourites a heart.</li>
            <li><strong class="text-white">💬 Time Capsule:</strong> thank the organisers, share a memory, or predict where we'll all be at the 30th.</li>
            <li><strong class="text-white">🎭 Then &amp; Now:</strong> put your 2006 matric photo next to a 2026 selfie and vote for "Most Changed".</li>
            <li><strong class="text-white">👥 Who's Here:</strong> see which classmates have checked in.</li>
          </ul>
        </section>

        <section class="card p-5 space-y-3" id="how-it-works">
          <h3 class="text-lg font-bold text-white">How it works</h3>
          <ol class="space-y-3 list-none">
            <li class="flex gap-3"><span class="step">1</span><span>Scan the QR code at the venue, or open the link. Nothing to install.</span></li>
            <li class="flex gap-3"><span class="step">2</span><span>Check in with your name, surname and email. Your phone is now your "account", with no password needed. Each name and each email can check in only once.</span></li>
            <li class="flex gap-3"><span class="step">3</span><span>Tap <strong class="text-white">Snap</strong> to take or choose a photo, pick a theme and add a caption. Photos are resized automatically, and location data is removed.</span></li>
            <li class="flex gap-3"><span class="step">4</span><span>Give each photo one heart (tap again to undo). In Then &amp; Now you get one vote per classmate, and you can't vote for yourself.</span></li>
            <li class="flex gap-3"><span class="step">5</span><span>Changed your mind? You can delete your own photos, notes and Then &amp; Now entry at any time.</span></li>
          </ol>
          <p class="text-sm text-slate-400">
            <strong class="text-slate-200">Log out</strong> (menu ☰) keeps everything you posted. After
            <strong class="text-slate-200">30 minutes without activity</strong> you're logged out automatically, and nothing is
            deleted. To log back in (also on another phone), check in with <strong class="text-slate-200">exactly the same
            name and email</strong>. You can be logged in on one phone at a time.
          </p>
          <p class="text-sm text-slate-400">
            <strong class="text-slate-200">Leave &amp; delete my data</strong> (menu ☰) removes you from Who's Here
            and permanently deletes everything you posted.
          </p>
        </section>

        <section class="card p-5 space-y-3 border-brakke-gold/40">
          <h3 class="text-lg font-bold text-white">What happens to the photos?</h3>
          <p>
            The reunion organisers from the Matric 2006 committee get <strong class="text-white">organiser (admin) rights</strong> in this app.
            After the event, they will gather the photos and decide where to share them, for example in the class
            <strong class="text-white">Facebook group</strong> or a shared album.
          </p>
          <p>
            Organisers can also remove any photo or note that is inappropriate or that someone asks to be taken down.
          </p>
          <p class="text-sm text-slate-400">
            Please be kind: only post photos you would be happy to see on the class Facebook page, and ask before
            posting a close-up of someone. If you see something that should come down, tell an organiser.
          </p>
        </section>

        <section class="card p-5 space-y-3">
          <h3 class="text-lg font-bold text-white">Your privacy</h3>
          <ul class="space-y-2 list-disc pl-5">
            <li>Your name, photos and notes are visible to everyone who has checked in.</li>
            <li>
              Your email is only used to keep one check-in per person. We don't store the address itself, only a
              scrambled code (a keyed hash) that can't be turned back into your email. Nobody can see it, not even the
              organisers, and you will never receive mail from this app.
            </li>
            <li>You can be tagged in photos and notes only after you've checked in, and you can remove your own tag at any time.</li>
            <li>Only you and the organisers can delete your posts. Nobody can post in your name.</li>
            <li>If an organiser removes a guest, everything that guest posted is deleted too.</li>
            <li>
              The organisers keep a private activity log of what happens in the app (for example who posted or deleted
              something). It contains no emails, photos or note texts. If you use "Leave &amp; delete my data", your name is
              removed from it.
            </li>
            <li>Want something removed after the event? Ask the organisers.</li>
          </ul>
        </section>

        <section class="card p-5 space-y-3">
          <h3 class="text-lg font-bold text-white">For organisers</h3>
          <p>
            On the welcome page, tap <strong class="text-white">🛡️ Organiser login</strong> and enter the organiser code from
            the committee. Organiser accounts are for moderating only: they can remove photos, notes and guests that aren't
            appropriate, publish the Story and export spreadsheets, but they can't post, heart or vote. The super admin (a
            separate code) can also prepare the Facebook pack. Use <strong class="text-white">☰ → Log out</strong> when you're done.
          </p>
          <p class="text-sm text-slate-400">
            Want to take part as yourself too? Check in as a normal guest on another phone or browser.
          </p>
        </section>

        <p class="text-center text-xs text-slate-500 pt-2">Made with ❤️ for the Matric class of 2006.</p>
      </main>
    </div>
  `,
  styles: [
    `
      .step {
        flex-shrink: 0;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 9999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 0.8rem;
        background: #f0c75e;
        color: #071226;
      }
    `
  ]
})
export class AboutComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);

  back(): void {
    if (window.history.length > 1 && this.router.navigated) {
      this.location.back();
    } else {
      void this.router.navigate([this.session.profile() ? '/feed' : '/welcome']);
    }
  }
}
