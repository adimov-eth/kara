import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    // Inline all assets below this size as base64 data URLs
    assetsInlineLimit: 100000,
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
});
