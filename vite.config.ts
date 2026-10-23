import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // cargo writes build output under src-tauri while vite runs; watching it crashes vite with EBUSY on Windows
    watch: { ignored: ['**/src-tauri/**'] },
  },
  test: {
    globals: true,
    environment: 'node',
    css: false,
  },
});
