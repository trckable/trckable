// The script-tag build (/js/t.js):
//   <script defer src="https://stats.example.com/js/t.js" data-site="tkb_…"></script>
// Options: data-api, data-cookieless, data-hash, data-dev, data-domain.
// API: trckable('goal', 'signup', { plan: 'pro' }). Calls made before the
// script loads are queued by the optional stub and replayed here.
import { start, type Config, type Tracker } from './core'

declare const __BANNER__: boolean

type Stub = Tracker & { q?: IArguments[] }

const s = document.currentScript as HTMLScriptElement
const ds = s.dataset
const cfg: Config = {
  site: ds.site!,
  api: ds.api || new URL('/api/e', s.src).href,
  cookieless: 'cookieless' in ds,
  hash: 'hash' in ds,
  dev: 'dev' in ds,
  domain: ds.domain,
}
// Wording for trckable's own cookie bar, assigned rather than passed so that a
// script built without that module does not carry the key at all.
if (__BANNER__) cfg.banner = { text: ds.bannerText, accept: ds.bannerAccept, decline: ds.bannerDecline, policy: ds.bannerPolicy, css: ds.bannerCss }
const t = start(cfg)
const w = window as unknown as { trckable?: Stub }
const queued = w.trckable?.q || []
w.trckable = t
for (const args of queued) (t as any)(...args)
