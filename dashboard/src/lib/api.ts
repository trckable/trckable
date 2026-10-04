// Typed client for the trckable REST API (/api/v1). Cookie auth; every
// non-GET request carries the CSRF header the server requires.
// `fail` is said once, from where every caller already imports the client: it tells a person that something failed.
export { fail } from '../components/toastBus'
import { filterParam } from './filterSet'

export interface KPIs {
  visitors: number
  sessions: number
  pageviews: number
  bounce_rate: number
  avg_session_s: number
  views_per_session: number
  new_visitor_share: number
}

export interface Row {
  value: string
  visitors: number
  sessions?: number
  pageviews?: number
  bounce_rate?: number
  revenue?: number // attributed net revenue, minor units
  customers?: number
}

export interface Money {
  currency: string
  exponent: number
  revenue: number
  refunds: number
  payments: number
  customers: number
  paying_visitors: number
  conversion: number
  revenue_per_visitor: number
  new_revenue: number
  renewal_revenue: number
  unattributed: number
  unconverted: number
  no_rate?: string[] // currencies the ECB publishes no rate for: never converted
  test?: boolean
}

export interface Point {
  t: string // local wall clock, "2026-09-20T09:00"
  visitors: number
  pageviews: number
  revenue?: number
  imported?: boolean // counts from an imported day (Google Analytics) are in this point
}

export interface Day {
  date: string
  kpis: KPIs
  dims: Record<string, Row[] | null>
  money?: { revenue: number; payments: number; new: number; renewal: number }
}

export interface Result {
  approximate: boolean
  kpis: KPIs
  series: Point[]
  imported?: { days: number; from: string; to: string }
  dims: Record<string, Row[] | null>
  goals: Row[] | null
  days?: Day[]
  money?: Money
  revenue_dims?: Record<string, Row[] | null>
}

export interface Report {
  site: string
  timezone: string
  bucket: Bucket
  from: string
  to: string
  current: Result
  previous?: Result
  previous_from?: string
  previous_to?: string
  online?: number
  /** What was turned away over the period, for the Visitors tile. Absent under a filter. */
  bots?: Bots
}

/** Robots, AI crawlers, headless browsers and data-centre visits filtered out of the period. */
export interface Bots {
  total: number
  kinds: Record<string, number>
}

export type Bucket = 'hour' | 'day' | 'week' | 'month'

export interface Site {
  id: string
  domain: string
  name: string
  timezone: string
  currency: string
  proxy_key: string
  /** Unix seconds of the last event; absent means nothing has arrived yet. */
  last_event_at?: number
  /** Unix seconds the site was added: what is only said in a site's first days. */
  created_at?: number
  /** The site's own look, when the owner set one: #rrggbb, and its icon. */
  color?: string
  icon_url?: string
  /** The site's first day of the week: 1 Monday, 0 Sunday. */
  week_start?: number
  /** Cookieless mode: visitors counted by a daily hash, so no new vs
   *  returning and no journeys (features/cookieless). */
  cookieless?: boolean
  /** The last time the server looked for the snippet from the outside. */
  check?: { at: number; found?: 'site' | 'other' | 'nosite' | 'none'; via?: string; error?: string }
}

export type SiteState = 'live' | 'quiet' | 'stopped' | 'new'

/** live = seen in the last day · quiet = seen, but not lately, and nothing
 *  known to be wrong · stopped = not seen lately, and the snippet was not
 *  found (or the site did not answer) when the server last looked, after the
 *  last visit · new = never seen. */
export function siteState(s: Site): SiteState {
  if (!s.last_event_at) return 'new'
  if (Date.now() / 1000 - s.last_event_at < 86400) return 'live'
  const c = s.check
  if (c && c.at > s.last_event_at && c.found !== 'site') return 'stopped'
  return 'quiet'
}

/** Whether the dashboard shows the install card over sample numbers. A site
    that never had a visit (the sites list says so at once) shows it from the
    first frame, so a refresh never flashes an empty dashboard first. A site
    that had visits shows it only once the events check (`everTracked`, null
    while unknown or not asked) finds none, as before. Real numbers or a
    filter always win. */
export function showsInstall(o: { site: Pick<Site, 'last_event_at'>; hasData: boolean; filtered: boolean; everTracked: boolean | null }): boolean {
  if (o.hasData || o.filtered) return false
  if (!o.site.last_event_at) return true
  return o.everTracked === false
}

/** Why a stopped site stopped, in a few words. */
export function stoppedWhy(s: Site): string {
  const c = s.check
  if (!c) return ''
  if (c.error) return `${s.domain} did not answer`
  if (c.found === 'other') return "another site's snippet is on the page"
  if (c.found === 'nosite') return 'the snippet on the page has no site id'
  return 'the snippet is not on the homepage'
}

export interface APIKey {
  id: string
  name: string
  prefix: string
  created_at: number
  last_used_at?: number
}

/** A payment arriving, as the live stream announces it: what, not who. */
export interface Sale {
  kind: 'sale'
  ts: number
  amount: number // minor units, net of tax when known
  currency: string
  exponent: number
}

export interface Visit {
  kind: 'pageview' | 'goal'
  ts: number
  visitor?: string // pseudonymous id, for opening a journey
  path?: string
  goal?: string
  channel?: string
  referrer?: string
  country?: string
  city?: string
  device?: string
  browser?: string
}

export interface Alert {
  id: string
  site_id: string
  kind: 'stopped' | 'spike' | 'customer' | 'disk' | 'weekly' | 'milestone'
  enabled: boolean
  target: string
  threshold: number
  last_fired: number
  created_at: number
}

/** A scheduled report for a site's clients (Settings → Alerts). */
export interface ReportSchedule {
  id: string
  site_id: string
  name: string
  cadence: 'weekly' | 'monthly'
  lang: string
  pdf: boolean
  recipients: string[]
  enabled: boolean
  last_sent: number
}

export interface ReportSchedules {
  schedules: ReportSchedule[]
  /** The server can send reports: email, and an address for the stop links. */
  ready: boolean
  mail: boolean
  langs: string[]
  max_recipients: number
}

export interface Segment {
  id: string
  name: string
  query: string
  created_at: number
}

export interface Annotation {
  id: string
  day: string
  text: string
  created_at: number
  /** Who left it: a teammate's name or email. Never on a share link. */
  author?: string
}

/** How an account arranged its sites in the switcher: the order, the
 *  pinned ones and named groups. Saved on the server, one per account. */
export interface SiteLayout {
  order: string[]
  pinned: string[]
  groups: { name: string; sites: string[] }[]
}

/** One site in the all-sites view. */
export interface SiteRow {
  id: string
  domain: string
  name: string
  visitors: number
  pageviews: number
  bounce_rate: number
  previous_visitors: number
  series: number[] | null
  online: number
  revenue?: number
  currency: string
  exponent: number
  error?: string
}

/** Reading depth: how far down pages people scrolled, 0–100. */
export interface ScrollReport {
  samples: number
  avg: number
  /** Share of page views reaching 25, 50, 75 and 90% (the end). */
  reached: [number, number, number, number]
  pages?: { path: string; pageviews: number; avg: number; read: number }[]
}

/** A site's link to Google Search Console. The key itself never comes back. */
export interface SearchConnection {
  client_email: string
  property: string
  created_at: number
  last_ok_at?: number
  last_error?: string
}
export interface SearchProperty {
  url: string
  permission: string
}
export interface SearchRow {
  key: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}
export interface SearchReport {
  property: string
  dim: 'query' | 'page'
  rows: SearchRow[] | null
  from: string
  to: string
  clicks: number
  impressions: number
  /** Google revises its newest days; from this day on the numbers may still move. */
  preliminary_from: string
  ignored_filters: string[] | null
}

export interface CrawlerReport {
  kinds: Record<string, number>
  series: { name: string; kind: string; total: number; values: number[] }[]
  pages: Row[]
  total: number
  errors: number
  buckets: string[]
  /** Which robot read which page, busiest first. */
  reads?: { path: string; name: string; kind: string; hits: number }[]
  /** Hits past fair use, counted without their page. */
  folded?: number
}

export interface SiteConfig {
  consent_free: boolean
  exclude_paths: string[]
  /** The owner's own addresses and ranges: never counted. */
  exclude_ips?: string[]
  honor_dnt: boolean
  record_city: boolean
  retention_days: number
  week_start: number
  bot_strict: boolean
  /** A hash-routed app: the part after # (/#/pricing) is kept as the page. */
  hash_mode?: boolean
  groups: ContentGroup[]
  /** Goals reached by visiting a page: "Saw pricing = /pricing". */
  page_goals?: ContentGroup[]
  banner: BannerText
}

/** What trckable's own cookie bar says, and how it looks. Empty fields keep
 *  the English wording and trckable's dark default. */
export interface BannerText {
  /** How consent is collected: 'read' watches the banner you already run,
   *  'bar' shows trckable's own. */
  mode: '' | 'bar'
  text: string
  accept: string
  decline: string
  policy: string
  bg: string
  fg: string
  button: string
  button_fg: string
  position: '' | 'bl' | 'wide'
  radius: number
  /** CSS added inside the bar's shadow root, last, so it wins. */
  css: string
}

/** One section of a site: a name and the paths that belong to it. */
/** Core Web Vitals at the 75th percentile. Null where nothing was measured —
 *  which is the truth, not a zero anyone could read as "instant". */
export interface WebVitals {
  samples: number
  lcp_ms?: number | null
  cls_1k?: number | null
  inp_ms?: number | null
  good: number
  /** The slowest pages: visitors carries that page's own p75 LCP in ms. */
  pages?: Row[]
}

/** The retention grid. back[i][k] is how many of cohort i came back k weeks
 *  later; a row is only as long as the range covers whole weeks. */
export interface Cohorts {
  weeks: string[]
  size: number[]
  back: number[][]
}

export interface ContentGroup {
  name: string
  path: string
}

export interface ModuleInfo {
  id: string
  name: string
  summary: string
  tracker?: string
  tracker_bytes?: number
  server?: string
  collects: boolean
  label?: string
  gap?: string
  gives?: string[]
  costs?: string[]
  loses?: string[]
  default_on: boolean
  enabled: boolean
}

export interface ScriptInfo {
  bytes: number
  core: number
  full: number
  url: string
}

export interface Provider {
  id: string
  name: string
  key_hint: string
  key_url: string
  events: string[]
  has_modes: boolean
}

export interface PayConnection {
  id: string
  site_id: string
  provider: string
  mode: 'live' | 'test'
  label: string
  managed: boolean
  webhook_url: string
  created_at: number
  last_event_at?: number
  last_test_event_at?: number
  last_sync_at?: number
  last_error?: string
  pending: number
  payments: number
  has_secret: boolean
}

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Sign-in only: the password was right, the second step is missing. */
    public needsCode = false,
    /** The server's short code for a refusal, when it sent one (lib/errors.ts turns it into words). */
    public code = '',
    /** A password page of a link whose site leaves trckable's name off. */
    public hideBrand = false,
  ) {
    super(message)
  }
}

/** What went wrong, in words, whatever was thrown. */
export const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** A refusal of what was typed (a wrong password or code), not a failure of the server: the field says so, in these words. */
export const refused = (e: unknown): boolean => e instanceof APIError && [400, 401, 403, 422].includes(e.status)
export const wrong = "That isn't right · Try again"

/** The error body the server sends with a failed request. */
type Failure = { error?: string; needs_code?: boolean; code?: string; hide_brand?: boolean }

export async function call<T>(method: string, path: string, body?: unknown, signal?: AbortSignal, quiet = false): Promise<T> {
  const res = await fetch('/api/v1' + path, {
    method,
    signal,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-Trckable-Request': '1' } : {}),
      ...(shareSession ? { 'X-Trckable-Share': shareSession } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.ok && method !== 'GET') dropAfterWrite(path)
  if (res.status === 204) return undefined as T
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const f = data as Failure
    if (res.status === 401 && !quiet && !path.startsWith('/login') && !path.startsWith('/setup') && !path.startsWith('/oidc')) onUnauthorized()
    throw new APIError(res.status, f.error ?? res.statusText, f.needs_code === true, typeof f.code === 'string' ? f.code : '', f.hide_brand === true)
  }
  return data as T
}

/** A write can change what a report says (a time zone, a currency, payments,
 *  what counts as a visit, a goal, a delete): the reports kept for that site,
 *  or for every site when the path names none, are not reused after it. */
function dropAfterWrite(path: string) {
  const site = /^\/sites\/([^/?]+)/.exec(path)
  dropReports(site ? decodeURIComponent(site[1]) : undefined)
}

/** A request whose answer has nothing to read: a 204, or a body nobody needs. */
export const act = (method: string, path: string, body?: unknown): Promise<void> => call<unknown>(method, path, body).then(() => undefined)

/** A body that is not JSON (today: a profile picture). */
export async function raw(method: string, path: string, body: Blob): Promise<void> {
  const res = await fetch('/api/v1' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'X-Trckable-Request': '1' },
    body,
  })
  if (!res.ok) {
    const f = (await res.json().catch(() => ({}))) as Failure
    throw new APIError(res.status, f.error ?? res.statusText, false, typeof f.code === 'string' ? f.code : '')
  }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn)

export interface ReportQuery {
  from: string
  to: string
  compare?: 'previous' | 'year' | 'custom'
  cfrom?: string
  cto?: string
  filters?: Filter[]
  daily?: boolean
  bucket?: Bucket
  testPayments?: boolean
  /** 'first' credits the visit that found them; absent credits the one that closed it. */
  attr?: 'first'
  /** Also break down exit pages, regions and cities. Only Full shows them, so
   *  only Full asks — Core's scan stays the size it has always been. */
  deep?: boolean
}

export interface Filter {
  dim: string
  /** Absent = is. Values of one dimension and op are alternatives (any of). */
  op?: 'not'
  value: string
}

export interface Heatmap {
  cells: number[][] // [weekday][hour]
  peak: number
  total: number
}

export interface FunnelStep {
  kind: 'page' | 'goal'
  value: string
}

export interface FunnelResult extends FunnelStep {
  visitors: number
  rate: number
  of_total: number
  median_s: number
  dropped: number
}

export interface JourneyVisit {
  start: string
  end: string
  channel?: string
  referrer?: string
  campaign?: string
  country?: string
  device?: string
  browser?: string
  os?: string
  pageviews: number
  engaged_s: number
  /** null when the visit holds no pageview or goal. */
  events: { at: string; kind: string; path?: string; goal?: string; props?: string; engaged_s?: number }[] | null
}

export interface JourneyResult {
  journey: { visitor: string; first_seen?: string; visits: JourneyVisit[]; truncated?: boolean }
  payments?: { at: string; amount: number; refunded?: number; kind: string; provider: string }[]
  currency?: string
}

/** The report selectors a module endpoint understands (range, zone, filters). */
export function rangeQS(q: ReportQuery): string {
  const p = new URLSearchParams({ from: q.from, to: q.to })
  for (const f of q.filters ?? []) p.append('f', filterParam(f))
  return '?' + p.toString()
}

export function reportURL(site: string, q: ReportQuery): string {
  const p = new URLSearchParams({ from: q.from, to: q.to })
  if (q.compare) p.set('compare', q.compare)
  if (q.compare === 'custom' && q.cfrom && q.cto) {
    p.set('cfrom', q.cfrom)
    p.set('cto', q.cto)
  }
  if (q.bucket) p.set('bucket', q.bucket)
  if (q.daily) p.set('daily', '1')
  if (q.deep) p.set('deep', '1')
  if (q.testPayments) p.set('payments', 'test')
  if (q.attr) p.set('attr', q.attr)
  for (const f of q.filters ?? []) p.append('f', filterParam(f))
  // A shared link has no site of its own to name: the cookie says which one,
  // so the address cannot be edited into someone else's numbers.
  if (shareMode) return `/share/report?${p}`
  return `/sites/${encodeURIComponent(site)}/report?${p}`
}

/** The same report, as a file. It carries the report's own parameters, so an
 *  export is always the page it was taken from rather than a fresh question. */
export function exportURL(site: string, q: ReportQuery): string {
  const url = reportURL(site, { ...q, daily: false, deep: true })
  return '/api/v1' + url.replace('/report?', '/export.csv?')
}

// shareMode routes reports through the public, read-only endpoint.
let shareMode = false
export const setShareMode = (on: boolean) => (shareMode = on)
// An embedded share link's session. Kept in memory only: the page inside the
// iframe is its only reader, and it is gone when the frame is.
let shareSession = ''
export const setShareSession = (s: string) => (shareSession = s)

export interface ShareInfo {
  name: string
  revenue: boolean
  /** The owner lets this link show the chart's notes. */
  notes?: boolean
  cookieless?: boolean
  expires?: number | null
  domain: string
  site: string
  timezone: string
  currency: string
  modules: Record<string, boolean>
  /** The site's own look, for the mark in the header: its colour, and its icon
   *  (an address on this server) when it has one. */
  color?: string
  icon_url?: string
  /** The owner's own look for the link: a colour for the page, a logo (an
   *  address on this server) and whether trckable's name is left off. */
  accent?: string
  logo_url?: string
  hide_brand?: boolean
  /** Only for an embedded link: the session the page sends as a header,
   *  because a browser does not send cookies into another site's iframe. */
  session?: string
}

/** How a site's share links look to the people who open them (Share dialog). */
export interface ShareLook {
  color: string
  hide_brand: boolean
  domain: string
  /** The domain was verified, so it is served; until then it is pending. */
  domain_ok: boolean
  /** A pending domain's proof: a TXT record at verify_name with verify_value. */
  verify_name?: string
  verify_value?: string
  logo_url: string
  /** What a custom domain's CNAME points at: this server's own host. */
  target: string
}

export interface Share {
  id: string
  site_id: string
  name: string
  revenue: boolean
  notes?: boolean
  expires_at?: number | null
  has_password: boolean
  created_at: number
  viewed_at?: number | null
  views: number
  /** Sites allowed to show this link in an iframe. */
  embed_origins?: string[]
  /** The link's address, for its owner to copy again. None for a link made
   *  before addresses were kept, or when the server cannot read it. */
  url?: string
}

export interface Health {
  version: string
  uptime_s: number
  events: { accepted: number; bots: number; rejected: number; lag: number }
  store: { events: number; bytes_used: number; bytes_free: number; days_left: number; bytes_per_event: number; events_per_day?: number }
  analytics: 'ready' | 'warming' | 'error'
  memory_bytes: number
  /** rss: the whole process, analytics store included · go: the Go runtime only */
  memory_source?: 'rss' | 'go'
  /** TRCKABLE_SECRET is not set: the key is only data/secret.key, next to the backups. */
  key_on_volume?: boolean
  /** The write-ahead log is refusing events, and why. */
  ingest_error?: string
  backup: { at: number; bytes: number; error?: string; error_at?: number; offsite?: string; offsite_at?: number; offsite_days?: number; offsite_error?: string }
  payments?: { connections: number; pending: number; last_event: number; last_sync: number }
}

export interface PersonFound {
  visitor: string
  events: number
  sessions: number
  first_seen?: string
  last_seen?: string
  countries?: string[]
}

export interface PersonPayment {
  provider: string
  id: string
  paid_at: string
  currency: string
  gross: number
  kind: string
  test?: boolean
}

export interface Brand {
  color: string
  icon_at: number
  icon_url: string
}

export interface Person {
  id: string
  email: string
  name: string
  role: string
  created_at: number
  two_step: boolean
  last_seen: number // unix seconds; 0: never signed in
  must_change: boolean // still has a password someone else chose
  holder: boolean // the first owner: not removed, not made a viewer
  has_avatar: boolean // chose a picture: /people/{id}/avatar
  avatar_v: number // moves when the picture changes: its cache-buster
}

/** Which of the account's sites each viewer may see: sites null is every
 *  site. */
export interface SiteAccessList {
  sites: { id: string; domain: string; name: string }[]
  viewers: { id: string; email: string; sites: string[] | null }[]
}

/** What adding someone answers: the person and their one-time password. */
export type Added = { person: Person; password: string }

export interface TwoStep {
  enabled: boolean
  recovery_left: number
}

export interface InstallCheck {
  url: string
  status?: number
  /** site: this site's snippet · other: a trckable script for another site ·
   *  nosite: trckable without any site id · none */
  found?: 'site' | 'other' | 'nosite' | 'none'
  /** Where this site's id was found: "page", or the URL of a script. */
  via?: string
  /** How many of the page's scripts were read. */
  scripts: number
  error?: string
}

/** A moment the data shows: a visitor step, the best day, a first. */
export type MilestoneKind = 'visitors' | 'pageviews' | 'record_day' | 'countries' | 'first_goal' | 'first_sale' | 'revenue'
export interface Milestone {
  kind: MilestoneKind
  step: string
  value: number
  /** Revenue: the site's own currency. */
  currency?: string
  day: string
  created_at: number
  /** Not yet closed by the person asking. */
  new: boolean
  /** A link is live; amount: it shows the amount. */
  shared: boolean
  amount?: boolean
}
/** The next step of a counted family and the total so far. */
export interface MilestoneNext {
  kind: MilestoneKind
  step: number
  now: number
  currency?: string
}
export interface Milestones {
  enabled: boolean
  milestones: Milestone[]
  moment: Milestone | null
  next?: MilestoneNext[]
}

export type WidgetKind = 'live' | 'badge' | 'counter' | 'revenue' | 'privacy' | 'online'
export interface WidgetLook {
  /** What the owner calls it, at most 40 characters; blank is the design's own name. */
  name?: string
  kind: WidgetKind
  theme: 'auto' | 'dark' | 'light'
  accent: string
  radius: number
  brand: boolean
  /** The language of its words: auto follows the visitor's browser. */
  lang: string
  /** Labels the owner reworded, by key; a key left out keeps the translated default. */
  texts: Record<string, string>
  /** The parts the design shows: bars, countries, pages, channels (live); ai (badge); channels (revenue); the mode (online): spark, or card with pages and countries. */
  shows: string[]
}
export interface Widget extends WidgetLook {
  name: string
  id: string
  site_id: string
  on: boolean
  created_at: number
}

export interface Profile {
  email: string
  name: string
  has_avatar: boolean
  /** The identity provider this session signed in with; absent for a password. */
  signed_in_with?: string
}

export const api = {
  setupStatus: () => call<{ needs_setup: boolean; sso?: { id: string; label: string }[] }>('GET', '/setup'),
  ssoCode: (code: string) => call<{ return_to: string }>('POST', '/oidc/code', { code }),
  setup: (token: string, email: string, password: string, domain: string) =>
    call<{ user: { email: string }; site: Site | null }>('POST', '/setup', { token, email, password, domain }),
  login: (email: string, password: string, code?: string) => call<{ user: { email: string } }>('POST', '/login', { email, password, code }),
  logout: () => act('POST', '/logout'),
  /** /me and /sites, asked at start-up alongside /setup. Quiet: a 401 here
   *  only means "not signed in yet" (or "set up first"), which /setup and /me
   *  already say, so it must not trigger the sign-in screen on its own. */
  early: () => ({
    me: call<{ kind: string; email?: string; role?: string; version?: string; keys?: Record<string, string>; update_check?: boolean; must_change?: boolean }>('GET', '/me', undefined, undefined, true).catch(() => null),
    sites: call<{ sites: Site[] }>('GET', '/sites', undefined, undefined, true).catch(() => null),
  }),
  sites: () => call<{ sites: Site[] }>('GET', '/sites'),
  siteLayout: () => call<SiteLayout>('GET', '/site-layout'),
  setSiteLayout: (l: SiteLayout) => call<SiteLayout>('PUT', '/site-layout', l),
  milestones: (site: string, next = false) => call<Milestones>('GET', `/sites/${encodeURIComponent(site)}/milestones${next ? '?next=1' : ''}`),
  closeMilestones: (site: string, keys: [string, string][]) => act('POST', `/sites/${encodeURIComponent(site)}/milestones/seen`, { keys }),

  openShare: (token: string, password?: string, embed?: boolean) => call<ShareInfo>('POST', '/share/open', { token, password, embed }),
  shareMe: () => call<ShareInfo>('GET', '/share/me'),
  profile: () => call<Profile>('GET', '/account'),
  report: (site: string, q: ReportQuery, signal?: AbortSignal) => call<Report>('GET', reportURL(site, q), undefined, signal),
  events: (site: string, limit = 20) =>
    call<{ events: { ts: string; path: string; kind: string; visitor?: string; goal?: string; channel?: string; country?: string; device?: string; browser?: string }[] }>(
      'GET',
      `/sites/${site}/events?limit=${limit}`,
    ),
  segments: (site: string) => call<{ segments: Segment[] }>('GET', `/sites/${site}/segments`),
  renameSegment: (site: string, id: string, name: string) => call<Segment>('PATCH', `/sites/${site}/segments/${id}`, { name }),
  deleteSegment: (site: string, id: string) => act('DELETE', `/sites/${site}/segments/${id}`),
  annotations: (site: string, from: string, to: string) => call<{ annotations: Annotation[] }>('GET', shareMode ? `/share/annotations?from=${from}&to=${to}` : `/sites/${site}/annotations?from=${from}&to=${to}`),
  modules: (site: string) => call<{ modules: ModuleInfo[]; script: ScriptInfo }>('GET', `/sites/${site}/modules`),
}

// A tiny request cache so hovering, re-opening a period, or switching back to
// a site is instant. The server caches too; this saves the round trip. A
// period that is over cannot change (bar a late event or a payment note), so it
// is kept for two minutes (the server can drop its own copy sooner than a
// browser can know); one that includes today for ten seconds, and the live stream asks
// again the moment a visit lands.
const cache = new Map<string, { at: number; data: Report }>()
const inflight = new Map<string, { gen: number; p: Promise<Report> }>()
// Moves whenever reports are dropped: a read that began before is answered,
// but neither kept nor shared with a later ask.
let generation = 0
const SHORT_MS = 10_000
const CLOSED_MS = 120_000
const KEPT = 96

/** Forget cached reports for a site, so the next read really asks the server. */
export function dropReports(site?: string) {
  generation++
  for (const key of [...cache.keys()]) if (!site || key.startsWith(site)) cache.delete(key)
}

/** How long a report for this query is good: a range that ended before any
 *  time zone's today (12 hours behind UTC at most) is over for good. */
export function reportTtl(q: Pick<ReportQuery, 'to' | 'cto'>, now = Date.now()): number {
  const latest = q.cto && q.cto > q.to ? q.cto : q.to
  return latest < new Date(now - 12 * 3_600_000).toISOString().slice(0, 10) ? CLOSED_MS : SHORT_MS
}

export function cachedReport(site: string, q: ReportQuery, maxAgeMs = reportTtl(q)): Promise<Report> {
  const key = site + reportURL(site, q)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < maxAgeMs) return Promise.resolve(hit.data)
  const running = inflight.get(key)
  if (running && running.gen === generation) return running.p
  const gen = generation
  const p = api
    .report(site, q)
    .then((data) => {
      if (gen !== generation) return data // dropped while it ran: it may predate the change
      cache.delete(key) // re-inserted last: the oldest read is the first to go
      cache.set(key, { at: Date.now(), data })
      const oldest = cache.keys().next().value
      if (cache.size > KEPT && oldest !== undefined) cache.delete(oldest)
      return data
    })
    .finally(() => {
      if (inflight.get(key)?.p === p) inflight.delete(key)
    })
  inflight.set(key, { gen, p })
  return p
}

export function peekReport(site: string, q: ReportQuery): Report | undefined {
  return cache.get(site + reportURL(site, q))?.data
}
