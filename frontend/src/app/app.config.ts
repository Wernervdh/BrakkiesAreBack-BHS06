import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withDisabledInitialNavigation } from '@angular/router';
import { routes } from './app.routes';
import { APP_CLOSED } from './app-status';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // While closed, no navigation runs, so no guard / session / Supabase call happens.
    APP_CLOSED
      ? provideRouter(routes, withComponentInputBinding(), withDisabledInitialNavigation())
      : provideRouter(routes, withComponentInputBinding())
  ]
};
