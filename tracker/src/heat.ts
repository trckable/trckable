// The heatmaps script, sent after the base script for a site with the module on
// (server/internal/web). The base script has already run, so this reads the
// same tag: the site, the address of the events endpoint, and the options.
import { heat } from './heatmap'

const s = document.currentScript as HTMLScriptElement
const ds = s.dataset
heat({
  site: ds.site!,
  api: (ds.api || new URL('/api/e', s.src).href).replace(/\/e$/, '/h'),
  sample: +ds.heatSample! >= 0 ? +ds.heatSample! : 1, // 0 is none, and what is not a number is all
  dev: 'dev' in ds,
  hash: 'hash' in ds,
})
