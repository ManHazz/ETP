import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// LOCAL DEV NOTE: proxy target defaults to Render so localhost:3000 shows
// live bins/telemetry from the same database as production. Flip back to
// http://localhost:8000 if you want to test against your local docker api.
const API_TARGET = process.env.VITE_API_TARGET || 'https://smartbin-api-xpsu.onrender.com'
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: { '/api': { target: API_TARGET, changeOrigin: true, secure: true } },
  },
})
