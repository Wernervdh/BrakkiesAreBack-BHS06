# Frontend: Angular app

Mobile-first Angular 19 app for the BHS Matric 2006 reunion. See the root [README.md](../README.md) for how the app works and setup, and [CLAUDE.md](../CLAUDE.md) for the technical overview.

```bash
npm install
npm start        # dev server on http://localhost:4200
npm run build    # production build → dist/brakkeback-bhs06/browser
```

Vercel builds this folder on every push to `main`; `vercel.json` holds the SPA rewrite and security headers.
