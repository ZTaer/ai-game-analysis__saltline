import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'reload-game-runtime',
      handleHotUpdate({ file, server }) {
        // Rebuild procedural GPU/audio resources together after engine edits.
        if (file.replaceAll('\\', '/').includes('/src/game/')) {
          server.ws.send({ type: 'full-reload' });
          return [];
        }
      },
    },
  ],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { sourcemap: true, chunkSizeWarningLimit: 1600 },
});
