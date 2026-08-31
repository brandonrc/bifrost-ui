/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Dev loop per spec §7: vite dev proxies to `mobula serve`.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8484',
        changeOrigin: true,
      },
      '/healthz': {
        target: 'http://127.0.0.1:8484',
        changeOrigin: true,
      },
      // Swagger UI lives on the backend; link out to it from the sidebar.
      '/docs': {
        target: 'http://127.0.0.1:8484',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
