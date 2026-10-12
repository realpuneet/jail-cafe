import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

const analyze = process.env.ANALYZE === '1';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Jail Ki Chai',
        short_name: 'Jail Ki Chai',
        description: 'Order chai, snacks and fast food, book a table or plan your party.',
        theme_color: '#33201a',
        background_color: '#fbf6ef',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'ik.imagekit.io',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'imagekit',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 86400 },
            },
          },
          {
            urlPattern: ({ url }) => /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 86400 },
            },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              /\/api\/v1\/(categories|menu-items|banners)/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'catalog-api',
              expiration: { maxEntries: 40, maxAgeSeconds: 3600 },
            },
          },
        ],
      },
    }),
    analyze && visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true }),
  ].filter(Boolean),
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Stable vendor chunks: long-lived in the HTTP cache and fetched in parallel.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id))
            return 'react';
          if (/node_modules\/(gsap|@gsap|lenis)\//.test(id)) return 'motion';
          if (
            /node_modules\/(@tanstack|axios|zustand|socket\.io-client|engine\.io-client)\//.test(id)
          )
            return 'data';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    css: false,
  },
});
