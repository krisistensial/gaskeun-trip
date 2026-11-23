import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const nodeEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const base = nodeEnv.VITE_BASE_PATH || (nodeEnv.VERCEL ? '/' : '/gaskeun-trip/');

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
        'assets/default-cover.svg',
      ],
      manifest: {
        name: 'GASKEUN! — Group Travel Hub',
        short_name: 'GASKEUN!',
        description:
          'Group trips, beautifully organized. Offline-first itinerary, wallet, and crew hub.',
        theme_color: '#F6F8F5',
        background_color: '#F6F8F5',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
