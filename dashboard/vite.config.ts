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

// The first load is one script and one stylesheet, and React beside them (it
// changes far less often, so a returning visit keeps it cached). Everything
// the first paint needs used to be cut into a dozen small files, each gzipped
// alone with its own hashed name in every preload list. Hashes are eight hex
// digits: 32 bits is plenty to tell one build's file from the next.
const split = {
  groups: [
    { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 1 },
    { name: 'core', tags: ['$initial' as const] },
  ],
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
    rolldownOptions: { output: { hashCharacters: 'hex', codeSplitting: split } },
  },
  server: {
    proxy: {
      '/api': { target: process.env.TRCKABLE_DEV_API ?? 'http://localhost:8080', changeOrigin: false },
    },
  },
})
