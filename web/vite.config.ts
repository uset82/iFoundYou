import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

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
  ],
});
