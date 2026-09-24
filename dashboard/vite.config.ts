import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The build lands inside the Go server, which embeds it: one binary, one deploy.
// `pnpm dev` proxies the API to a local trckabled (TRCKABLE_DEV_API, default :8080).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../server/internal/web/dist',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
  },
  server: {
    proxy: {
      '/api': { target: process.env.TRCKABLE_DEV_API ?? 'http://localhost:8080', changeOrigin: false },
    },
  },
})
