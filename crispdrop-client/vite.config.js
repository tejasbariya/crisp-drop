import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_URL || 'http://localhost:3001';

  return {
  plugins: [
    react(),

    VitePWA({
      // Use 'generateSW' to let Workbox auto-generate the service worker.
      // Switch to 'injectManifest' for full custom SW control in the future.
      strategies: 'generateSW',

      registerType: 'prompt', // 'prompt' = show our custom update banner instead of auto-swap

      // Don't auto-register SW in development — makes debugging much easier
      devOptions: {
        enabled: false,
      },

      // Manifest is already in public/ as manifest.webmanifest — don't generate a duplicate
      manifest: false,
      manifestFilename: 'manifest.webmanifest',

      workbox: {
        // ── Precache app shell ─────────────────────────────────────────────
        // Workbox will inject a precache manifest for these patterns automatically
        globPatterns: [
          '**/*.{js,css,html,woff2,woff,ttf,svg,png,webp,ico}',
        ],

        // ── Safety: NEVER cache signaling or WebRTC traffic ───────────────
        // These must always go through the network.
        navigateFallbackDenylist: [
          /^\/socket\.io\//,
          /^\/api\//,
        ],

        // ── Runtime caching strategies ─────────────────────────────────────
        runtimeCaching: [
          // Google Fonts — cache-first with long TTL
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },

          // Static assets — cache-first
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-image-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },

          // App navigation — network-first with SW fallback to app shell
          // EXPLICITLY EXCLUDES Socket.io and API routes
          {
            urlPattern: ({ url }) => {
              const excluded = ['/socket.io', '/api/'];
              return excluded.every((p) => !url.pathname.startsWith(p));
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
        ],

        // Skip waiting is intentionally FALSE — we want the update banner to appear
        skipWaiting: false,
        clientsClaim: false,
      },

      // Don't inline the SW registration script — we handle it in main.jsx
      injectRegister: null,
    }),
  ],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
      },
      '/socket.io': {
        target,
        ws: true,
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    // Vite 8 (rolldown) handles code splitting automatically
  }
  };
});
