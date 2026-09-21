/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': new URL('./src/', import.meta.url).pathname },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The sandbox preview is served from an *.e2b.app proxy host.
    allowedHosts: true,
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vite's own preload helpers are shared by every lazy route; keep them
          // with the shell so no heavy vendor chunk gets dragged in by accident.
          if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) return 'shell';
          if (!id.includes('node_modules')) return undefined;
          // Heavy, tool-specific libraries get their own chunks so the shell
          // never pays for them; they load with the first tool that needs them.
          if (id.includes('pdf-lib') || id.includes('@pdf-lib') || id.includes('/pako/')) return 'pdf-lib';
          if (id.includes('sql-formatter')) return 'sql-formatter';
          if (id.includes('/yaml/')) return 'yaml';
          if (id.includes('/uqr/')) return 'qr';
          if (id.includes('/motion') || id.includes('framer-motion')) return 'motion';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react-router')) return 'router';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('/scheduler/')) return 'react';
          return 'vendor';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: { provider: 'v8', include: ['src/lib/**'] },
  },
});
