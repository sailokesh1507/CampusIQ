import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Vercel serves the built client from its public asset directory. The same
  // directory is served by Express for the Docker/Render deployment.
  publicDir: false,
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/healthz': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'public',
  },
});
