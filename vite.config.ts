import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'TeachDesk',
        short_name: 'TeachDesk',
        description: 'Private Teaching Portal — students, schedule, billing & more',
        theme_color: '#4f46e5',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png',            sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png',           sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',           sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache all app routes for offline access
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache Firebase Firestore calls
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'firestore-cache', networkTimeoutSeconds: 5 },
          },
          {
            // Cache QR code images
            urlPattern: /^https:\/\/api\.qrserver\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'qr-cache', expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'pdf': ['jspdf'],
          'vendor': ['react', 'react-dom', 'react-router-dom', 'date-fns'],
        },
      },
    },
  },
})
