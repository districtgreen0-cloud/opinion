import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4700,
    strictPort: true,
    // dev: borrow the live feeds endpoint from the deployed share worker (Luma iCal is server-side only)
    proxy: { '/api/feeds': { target: 'https://opinion-london.calderabalkan.workers.dev', changeOrigin: true } },
  },
  preview: { proxy: { '/api/feeds': { target: 'https://opinion-london.calderabalkan.workers.dev', changeOrigin: true } } },
  build: {
    chunkSizeWarningLimit: 2500,
    // iPhones on iOS 15–16.3 can't parse newer syntax (e.g. class static blocks in three.js) → lower it
    target: ['es2020', 'safari15'],
  },
})