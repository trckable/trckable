import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copy } from './src/components/loading/copy'
import { bootHtml } from './src/components/loading/markup'

// The first paint, before any JavaScript, is the loading ghost rather than a
// blank page: its markup goes straight into #root (React replaces it), and its
// CSS is already in the render-blocking stylesheet, so no inline style needed.
const bootGhost = {
  name: 'boot-ghost',
  transformIndexHtml: (html: string) => html.replace('<div id="root"></div>', `<div id="root">${bootHtml(copy.boot)}</div>`),
}

// The build lands inside the Go server, which embeds it: one binary, one deploy.
// `pnpm dev` proxies the API to a local trckabled (TRCKABLE_DEV_API, default :8080).
export default defineConfig({
  plugins: [react(), bootGhost],
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
