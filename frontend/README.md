# SmartBin Dashboard

Real-time monitoring dashboard for the SmartBin waste management system.

## Setup

```bash
cd smartbin-dashboard
npm install
npm run dev
```

Opens at `http://localhost:3000`. The Vite dev server proxies `/api` requests to `http://localhost:8000` (the FastAPI backend).

Make sure the backend is running (`docker-compose up -d` in the `smartbin/` dir) and the simulator is feeding data.

## Stack

- Vite + React 18
- No external UI library — pure CSS with design tokens
- Responsive grid (works on mobile)
- Polls `/api/status` every 5 seconds

## PWA conversion

The HTML already has the PWA meta tags. To complete PWA setup:

1. `npm install vite-plugin-pwa -D`
2. Add to `vite.config.js`:
   ```js
   import { VitePWA } from 'vite-plugin-pwa'
   // in plugins array:
   VitePWA({ registerType: 'autoUpdate' })
   ```
3. Add icons to `/public` and a `manifest.json`
