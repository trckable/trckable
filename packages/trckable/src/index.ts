// trckable — framework-agnostic API. Every entry point (react, next) imports
// this module, so an app always has exactly one tracker, however many ways it
// talks to it.
import { start, type Config, type Tracker } from '@trckable/tracker'

/** Goal properties, e.g. { plan: 'pro', seats: 3 }. */
export type Props = Record<string, string | number | boolean>

// Public types are declared here (not re-exported from the internal tracker
// package, which is never published). These checks fail the build if the two
// ever drift apart.
type Assert<T extends true> = T
type _PropsMatch = Assert<Props extends import('@trckable/tracker').Props ? true : false>
type _OptionsMatch = Assert<Required<Omit<Config, 'api'>> extends Required<Omit<Options, 'host' | 'api'>> ? true : false>

export interface Options {
  /** Site id from your trckable dashboard ("tkb_…"). */
  site: string
  /** Cookieless mode: no cookie, nothing stored in the browser. */
  cookieless?: boolean
  /** Count #/routes as pages (hash-routed apps). */
  hash?: boolean
  /** Allow tracking on localhost and in iframes (development). */
  dev?: boolean
  /** Cookie domain, e.g. "example.com" to share visitors across subdomains. */
  domain?: string
  /** Where your trckable server lives, e.g. "https://stats.example.com". */
  host?: string
  /**
   * Full events endpoint. Defaults to `${host}/api/e`, or to the same-origin
   * proxy route "/api/e" when no host is given (see trckable/next and
   * trckable/server). Same-origin is the most accurate setup.
   */
  api?: string
}

let tracker: Tracker | undefined
let pending: unknown[][] = []

/** Starts tracking (once). Safe to call on the server: it does nothing there. */
export function init(options: Options): void {
  if (tracker || typeof window === 'undefined') return
  const api = options.api ?? (options.host ? options.host.replace(/\/+$/, '') + '/api/e' : '/api/e')
  tracker = start({ ...options, api })
  for (const args of pending) (tracker as (...a: unknown[]) => void)(...args)
  pending = []
}

function call(...args: unknown[]) {
  if (tracker) (tracker as (...a: unknown[]) => void)(...args)
  else if (typeof window !== 'undefined') pending.push(args) // before init: replayed
}

/** Records a goal, e.g. track('signup', { plan: 'pro' }). */
export function track(name: string, props?: Props): void {
  call('goal', name, props)
}

/** Records a pageview manually (automatic tracking already covers SPA routes). */
export function pageview(): void {
  call('pageview')
}

/** Switches between cookieless (false) and cookie mode (true) after consent. */
export function consent(granted: boolean): void {
  call('consent', granted)
}
