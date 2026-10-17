import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))

// Mêmes en-têtes de sécurité (CSP…) que sur Vercel pour `npm run preview` et les
// tests de bout en bout : on teste l'application telle qu'elle est servie.
const securityHeaders = Object.fromEntries(
  ((vercel.headers || []).find((h) => h.source === '/(.*)')?.headers || []).map((h) => [h.key, h.value]),
)

// TicketScope BE — installable PWA, works offline once loaded.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version.replace(/\.0$/, '')) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        // On ne précache PAS les gros fichiers OCR (WASM ~3 Mo, modèle) pour
        // garder l'installation légère ; ils sont mis en cache à la 1re lecture.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['**/tesseract/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/tesseract/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ticketscope-ocr',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'TicketScope BE',
        short_name: 'TicketScope',
        description:
          'Analyse de tickets de caisse : extraction, normalisation des produits et classification COICOP.',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'any',
        lang: 'fr-BE',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  preview: { headers: securityHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'eval/**/*.test.js'],
  },
})
