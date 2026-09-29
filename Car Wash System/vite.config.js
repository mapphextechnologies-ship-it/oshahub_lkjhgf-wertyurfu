import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';

export default defineConfig({
  publicDir: 'carwash-public',
  plugins: [
    react()
  ],
  build: {
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        platformAdmin: fileURLToPath(new URL('./super-admin.html', import.meta.url)),
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        business: fileURLToPath(new URL('./business.html', import.meta.url))
      }
    }
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'react-native': 'react-native-web'
    }
  },
  server: {
    port: 5173
  }
});
