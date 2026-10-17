import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { SessionService } from './services/session.service';
import { WelcomeComponent } from './components/welcome/welcome.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { AboutComponent } from './components/about/about.component';
import { StoryComponent } from './components/story/story.component';
import { FacebookPackComponent } from './components/organizer/facebook-pack.component';
import { ActivityLogComponent } from './components/organizer/activity-log.component';
import { ReunionService } from './services/reunion.service';

/** /feed requires a checked-in guest. */
const checkedInGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);
  try {
    await session.init();
  } catch {
    return router.parseUrl('/welcome');
  }
  return session.profile() ? true : router.parseUrl('/welcome');
};

/** The Story is hidden until an organiser publishes it (organisers can always preview). */
const storyGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const reunion = inject(ReunionService);
  const router = inject(Router);
  try {
    await session.init();
    if (!session.profile()) return router.parseUrl('/welcome');
    await reunion.start();
  } catch {
    return router.parseUrl('/feed');
  }
  return reunion.storyPublished() || session.isOrganizer() ? true : router.parseUrl('/feed');
};

/** The Facebook pack is for the super admin only (the database enforces it too). */
const superAdminGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);
  try {
    await session.init();
  } catch {
    return router.parseUrl('/welcome');
  }
  return session.isSuperAdmin() ? true : router.parseUrl(session.profile() ? '/feed' : '/welcome');
};

/** Checked-in guests skip the welcome page. */
const welcomeGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);
  try {
    await session.init();
  } catch {
    return true;
  }
  return session.profile() ? router.parseUrl('/feed') : true;
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'welcome' },
  { path: 'welcome', component: WelcomeComponent, canActivate: [welcomeGuard], title: "Welcome | '06 BrakkiesAreBack" },
  { path: 'feed', component: DashboardComponent, canActivate: [checkedInGuard], title: "'06 BrakkiesAreBack | BHS Reunion" },
  { path: 'story', component: StoryComponent, canActivate: [storyGuard], title: "The Story | '06 BrakkiesAreBack" },
  { path: 'organiser/facebook', component: FacebookPackComponent, canActivate: [superAdminGuard], title: "Facebook pack | '06 BrakkiesAreBack" },
  { path: 'organiser/activity', component: ActivityLogComponent, canActivate: [superAdminGuard], title: "Activity log | '06 BrakkiesAreBack" },
  { path: 'about', component: AboutComponent, title: "About & How it works | '06 BrakkiesAreBack" },
  { path: '**', redirectTo: 'welcome' }
];
