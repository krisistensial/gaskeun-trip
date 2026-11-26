import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const nodeEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const base = nodeEnv.VITE_BASE_PATH || (nodeEnv.VERCEL ? '/' : '/gaskeun-trip/');

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('leaflet')) return 'vendor-leaflet';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules\\react\\') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules\\react-dom\\') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules\\scheduler\\')
          ) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
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
            src: 'pwa-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
        dontCacheBustURLsMatching: /-[a-zA-Z0-9_-]{8}\.\w+$/,
      },
    }),
  ],
});
