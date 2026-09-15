import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4311', '/uploads': 'http://localhost:4311' } },
  build: {
    // naive-ui / three are large but stable vendor libs split into their own
    // cacheable chunks; raise the limit so their expected size doesn't read as
    // a regression in build output.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split heavy, stable vendors into their own cacheable chunks so app
        // code changes don't force users to re-download three.js / naive-ui.
        manualChunks: {
          three: ['three'],
          naive: ['naive-ui'],
          vendor: ['vue', 'vue-router', '@tanstack/vue-query'],
        },
      },
    },
  },
});
