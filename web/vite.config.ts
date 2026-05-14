import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';

// `@meshtastic/core` pulls in `tslog`, which references Node's `os`, `path`,
// and `util` modules. We polyfill the minimum needed so the bundle resolves
// in the browser. The Meshtastic packages themselves are dynamic-imported
// from `BluetoothMeshTransport`, so this only affects the lazy chunk.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['os', 'path', 'util', 'process'],
      globals: { Buffer: true, global: true, process: true },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180.png', 'mask-icon.svg'],
      manifest: {
        name: 'Dommedag',
        short_name: 'Dommedag',
        description: 'Private, opt-in location sharing and offline mesh messenger.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3000000 // 3MB limit
      }
    })
  ],
});
