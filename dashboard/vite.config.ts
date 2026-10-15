import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copy } from './src/components/loading/copy'
import { bootHtml } from './src/components/loading/markup'
import { dashHtml } from './src/components/skeleton/dashMarkup'
import { wordmarkFont } from './wordmarkFont'

// The first paint, before any JavaScript, is never a blank page: the dashboard's own boxes where this
// browser kept its site list (public/theme.js says so on <html>), the loading ghost anywhere else. The
// markup goes straight into #root (React replaces it), and its CSS is already in the render-blocking
// stylesheet, so no inline style needed.
const bootGhost = {
  name: 'boot-ghost',
  transformIndexHtml: (html: string) => html.replace('<div id="root"></div>', `<div id="root"><div class="boot-ghost">${bootHtml(copy.boot)}</div>${dashHtml(copy.boot)}</div>`),
}

// The first load is one script and one stylesheet, and React beside them (it
// changes far less often, so a returning visit keeps it cached). Everything
// the first paint needs used to be cut into a dozen small files, each gzipped
// alone with its own hashed name in every preload list. Hashes are eight hex
// digits: 32 bits is plenty to tell one build's file from the next.
const split = {
  groups: [
    { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 1 },
    // Which language the page speaks, and the helper that loads a lazy file: files of their own,
    // because the first script waits for the language's words (src/i18n/index.ts) and those words
    // load through, and import, these. Inside the first script they would wait for it while it
    // waits for them.
    { name: 'lang', test: /src[\\/]i18n[\\/]lang\.ts$|preload-helper/, priority: 2 },
    { name: 'core', tags: ['$initial' as const] },
  ],
}

// The build lands inside the Go server, which embeds it: one binary, one deploy.
// `pnpm dev` proxies the API to a local trckabled (TRCKABLE_DEV_API, default :8080).
export default defineConfig({
  plugins: [react(), bootGhost, wordmarkFont()],
  build: {
    outDir: '../server/internal/web/dist',
    emptyOutDir: true,
    target: 'es2022',
    // A lazy chunk's styles are fetched with it; its script imports are left to the browser. The list of
    // every chunk's script imports sat in the first script (about 2.7 KB gzipped of hashed names) to save
    // one round trip, once, on the first open of a chunk that shares code with another.
    modulePreload: { polyfill: false, resolveDependencies: (_file, deps) => deps.filter((d) => d.endsWith('.css')) },
    reportCompressedSize: false,
    rolldownOptions: { output: { hashCharacters: 'hex', codeSplitting: split } },
  },
  server: {
    proxy: {
      '/api': { target: process.env.TRCKABLE_DEV_API ?? 'http://localhost:8080', changeOrigin: false },
    },
  },
})
