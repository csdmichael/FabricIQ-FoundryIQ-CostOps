import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { APP_BASE_HREF, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { provideIonicAngular } from '@ionic/angular/standalone';

// This app navigates via the Location service (URL <-> active view) rather than
// the Angular Router, so we provide PathLocationStrategy directly and omit the
// router (an empty router would raise NG04002 on deep-linked sub-paths).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideIonicAngular({ mode: 'md' }),
    { provide: APP_BASE_HREF, useValue: '/' },
    { provide: LocationStrategy, useClass: PathLocationStrategy },
  ]
};
