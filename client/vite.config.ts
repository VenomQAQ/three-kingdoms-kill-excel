import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tk/engine': path.resolve(__dirname, '../packages/engine/src/index.ts'),
    },
  },
  server: {
    port: 5052,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
      '/rooms': {
        target: 'http://localhost:3000',
      },
    },
  },
});
