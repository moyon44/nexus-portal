import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Your public host names (e.g. ".example.com" for every subdomain) come
    // from ALLOWED_HOSTS, comma-separated.
    allowedHosts: [
      'nexus-portal', // Container name for Docker Compose
      'localhost',
      '127.0.0.1',
      ...(process.env.ALLOWED_HOSTS ?? '').split(',').map(h => h.trim()).filter(Boolean),
    ]
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
