// Typed client for the trckable REST API (/api/v1). Cookie auth; every
// non-GET request carries the CSRF header the server requires.

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
  test?: boolean
}

export interface Point {
  t: string // local wall clock, "2026-09-20T09:00"
  visitors: number
  pageviews: number
  revenue?: number
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
  /** The site's own look, when the owner set one: #rrggbb, and its icon. */
  color?: string
  icon_url?: string
  /** The site's first day of the week: 1 Monday, 0 Sunday. */
  week_start?: number
  /** The last time the server looked for the snippet from the outside. */
  check?: { at: number; found?: 'site' | 'other' | 'none'; via?: string; error?: string }
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

/** Why a stopped site stopped, in a few words. */
export function stoppedWhy(s: Site): string {
  const c = s.check
  if (!c) return ''
  if (c.error) return `${s.domain} did not answer`
  if (c.found === 'other') return "another site's snippet is on the page"
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
  kind: 'stopped' | 'spike' | 'customer' | 'disk' | 'weekly'
  enabled: boolean
  target: string
  threshold: number
  last_fired: number
  created_at: number
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
}

export interface SiteConfig {
  consent_free: boolean
  exclude_paths: string[]
  honor_dnt: boolean
  record_city: boolean
  retention_days: number
  week_start: number
  bot_strict: boolean
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
  ) {
    super(message)
  }
}

async function call<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
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
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/login') && !path.startsWith('/setup')) onUnauthorized()
    throw new APIError(res.status, data.error ?? res.statusText, data.needs_code === true)
  }
  return data as T
}

/** A body that is not JSON (today: a profile picture). */
async function raw(method: string, path: string, body: Blob): Promise<void> {
  const res = await fetch('/api/v1' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'X-Trckable-Request': '1' },
    body,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new APIError(res.status, data.error ?? res.statusText)
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
  pageviews: number
  engaged_s: number
  events: { at: string; kind: string; path?: string; goal?: string; props?: string; engaged_s?: number }[]
}

export interface JourneyResult {
  journey: { visitor: string; first_seen?: string; visits: JourneyVisit[]; truncated?: boolean }
  payments?: { at: string; amount: number; refunded?: number; kind: string; provider: string }[]
  currency?: string
}

/** The report selectors a module endpoint understands (range, zone, filters). */
function rangeQS(q: ReportQuery): string {
  const p = new URLSearchParams({ from: q.from, to: q.to })
  for (const f of q.filters ?? []) p.append('f', f.dim + ':' + f.value)
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
  for (const f of q.filters ?? []) p.append('f', f.dim + ':' + f.value)
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
  expires?: number | null
  domain: string
  site: string
  timezone: string
  currency: string
  modules: Record<string, boolean>
  /** Only for an embedded link: the session the page sends as a header,
   *  because a browser does not send cookies into another site's iframe. */
  session?: string
}

export interface Share {
  id: string
  site_id: string
  name: string
  revenue: boolean
  expires_at?: number | null
  has_password: boolean
  created_at: number
  viewed_at?: number | null
  views: number
  /** Sites allowed to show this link in an iframe. */
  embed_origins?: string[]
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
}

export interface TwoStep {
  enabled: boolean
  recovery_left: number
}

export interface InstallCheck {
  url: string
  status?: number
  /** site: this site's snippet · other: a trckable script for another site · none */
  found?: 'site' | 'other' | 'none'
  /** Where this site's id was found: "page", or the URL of a script. */
  via?: string
  /** How many of the page's scripts were read. */
  scripts: number
  error?: string
}

/** A moment the data shows: a visitor step, the best day, a first. */
export interface Milestone {
  id: string
  kind: 'visitors' | 'best_day' | 'first_ai' | 'first_sale'
  value: number
  day: string
}

export type WidgetKind = 'live' | 'badge' | 'counter' | 'revenue' | 'privacy'
export interface WidgetLook {
  kind: WidgetKind
  theme: 'auto' | 'dark' | 'light'
  accent: string
  radius: number
  brand: boolean
  /** The parts the design shows: bars, countries, pages, channels (live); ai (badge); channels (revenue). */
  shows: string[]
}
export interface Widget extends WidgetLook {
  id: string
  site_id: string
  on: boolean
  created_at: number
}

export interface Profile {
  email: string
  name: string
  has_avatar: boolean
}

export const api = {
  setupStatus: () => call<{ needs_setup: boolean; managed?: string }>('GET', '/setup'),
  setup: (token: string, email: string, password: string, domain: string) =>
    call<{ user: { email: string }; site: Site | null }>('POST', '/setup', { token, email, password, domain }),
  login: (email: string, password: string, code?: string) => call<{ user: { email: string } }>('POST', '/login', { email, password, code }),
  logout: () => call<void>('POST', '/logout'),
  me: () => call<{ kind: string; email?: string; role?: string; version?: string; keys?: Record<string, string>; update_check?: boolean; must_change?: boolean; operator?: boolean }>('GET', '/me'),
  setKeys: (keys: Record<string, string>) => call<{ keys: Record<string, string> }>('PUT', '/me/keys', { keys }),
  sites: () => call<{ sites: Site[] }>('GET', '/sites'),
  createSite: (domain: string) => call<Site>('POST', '/sites', { domain }),
  updateSite: (id: string, patch: { name?: string; timezone?: string; currency?: string }) => call<Site>('PATCH', `/sites/${id}`, patch),
  deleteSite: (id: string, domain: string) => call<{ events: number; sessions: number; payments: number; connections: number }>('DELETE', `/sites/${id}`, { domain }),
  findPerson: (site: string, by: 'visitor' | 'email', value: string) =>
    call<{ found: PersonFound; payments: PersonPayment[] }>('GET', `/sites/${site}/privacy/person?${by}=${encodeURIComponent(value)}`),
  exportPersonURL: (site: string, by: 'visitor' | 'email', value: string) => `/api/v1/sites/${site}/privacy/export?${by}=${encodeURIComponent(value)}`,
  erasePerson: (site: string, by: 'visitor' | 'email', value: string) =>
    call<{ visitor: string; events: number; sessions: number; payments: number; kept?: string }>(
      'DELETE',
      `/sites/${site}/privacy/person?${by}=${encodeURIComponent(value)}`,
    ),
  turnOffTwoStepFor: (id: string, password: string, code?: string) => call<void>('POST', `/people/${id}/two-step/off`, { password, code }),
  startOverKeys: (password: string) => call<{ connections: number }>('POST', '/payments/start-over', { password }),
  milestones: (site: string) => call<{ milestones: Milestone[] }>('GET', `/sites/${encodeURIComponent(site)}/milestones`),
  deletePreview: (site: string) => call<Record<string, number>>('GET', `/sites/${encodeURIComponent(site)}/delete-preview`),
  widgets: (site: string) => call<{ widgets: Widget[]; base: string }>('GET', `/sites/${site}/widgets`),
  createWidget: (site: string, w: WidgetLook) => call<Widget>('POST', `/sites/${site}/widgets`, w),
  updateWidget: (site: string, id: string, w: WidgetLook & { on: boolean }) => call<Widget>('PUT', `/sites/${site}/widgets/${id}`, w),
  deleteWidget: (site: string, id: string) => call<void>('DELETE', `/sites/${site}/widgets/${id}`),
  shares: (site: string) => call<{ shares: Share[]; base: string }>('GET', `/sites/${site}/shares`),
  createShare: (site: string, body: { name: string; password?: string; revenue: boolean; days: number; embed_origins?: string[] }) =>
    call<{ share: Share; url: string }>('POST', `/sites/${site}/shares`, body),
  deleteShare: (site: string, id: string) => call<void>('DELETE', `/sites/${site}/shares/${id}`),
  openShare: (token: string, password?: string, embed?: boolean) => call<ShareInfo>('POST', '/share/open', { token, password, embed }),
  shareMe: () => call<ShareInfo>('GET', '/share/me'),
  people: () => call<{ people: Person[] }>('GET', '/people'),
  addPerson: (email: string, role: string) => call<{ person: Person; password: string; signin?: string }>('POST', '/people', { email, role }),
  setPersonRole: (id: string, role: string) => call<{ people: Person[] }>('PATCH', `/people/${id}`, { role }),
  removePerson: (id: string) => call<void>('DELETE', `/people/${id}`),
  setSiteIcon: (site: string, picture: Blob) => raw('PUT', `/sites/${site}/icon`, picture),
  clearSiteIcon: (site: string) => call<Brand>('DELETE', `/sites/${site}/icon`),
  fetchSiteFavicon: (site: string) => call<Brand>('POST', `/sites/${site}/icon/favicon`),
  setSiteColor: (site: string, color: string) => call<Brand>('PUT', `/sites/${site}/color`, { color }),
  resetPersonPassword: (id: string, password: string, code?: string) => call<{ email: string; password: string }>('POST', `/people/${id}/password`, { password, code }),
  changePassword: (current: string, password: string) => call<void>('POST', '/account/password', { current, password }),
  twoStep: () => call<TwoStep>('GET', '/account/2fa'),
  startTwoStep: (password: string, code?: string) => call<{ secret: string; uri: string }>('POST', '/account/2fa/start', { password, code }),
  enableTwoStep: (password: string, code: string) => call<{ recovery: string[] }>('POST', '/account/2fa/enable', { password, code }),
  // While two-step is on, changing it needs a code from the app (or a recovery code) as well.
  disableTwoStep: (password: string, code: string) => call<void>('POST', '/account/2fa/disable', { password, code }),
  profile: () => call<Profile>('GET', '/account'),
  health: () => call<Health>('GET', '/health'),
  setName: (name: string) => call<Profile>('PATCH', '/account', { name }),
  setAvatar: (file: Blob) => raw('PUT', '/account/avatar', file),
  clearAvatar: () => call<void>('DELETE', '/account/avatar'),
  report: (site: string, q: ReportQuery, signal?: AbortSignal) => call<Report>('GET', reportURL(site, q), undefined, signal),
  /** This server reads the site's homepage and looks for the snippet. */
  checkInstall: (site: string) => call<InstallCheck>('POST', `/sites/${encodeURIComponent(site)}/install/check`),
  events: (site: string, limit = 20) =>
    call<{ events: { ts: string; path: string; kind: string; visitor?: string; goal?: string; channel?: string; country?: string; device?: string; browser?: string }[] }>(
      'GET',
      `/sites/${site}/events?limit=${limit}`,
    ),
  keys: () => call<{ keys: APIKey[] }>('GET', '/keys'),
  heatmap: (site: string, q: ReportQuery) => call<Heatmap>('GET', `/sites/${site}/report/heatmap` + rangeQS(q)),
  funnel: (site: string, q: ReportQuery, steps: FunnelStep[]) => call<{ steps: FunnelResult[] }>('POST', `/sites/${site}/report/funnel` + rangeQS(q), { steps }),
  goalProps: (site: string, q: ReportQuery, goal: string) =>
    call<{ goal: string; properties: { value: string; visitors: number }[] }>('GET', `/sites/${site}/report/goal-props` + rangeQS(q) + '&goal=' + encodeURIComponent(goal)),
  journey: (site: string, visitor: string, q: ReportQuery) => call<JourneyResult>('GET', `/sites/${site}/journey/${visitor}` + rangeQS(q)),
  siteConfig: (site: string) => call<SiteConfig>('GET', `/sites/${site}/config`),
  setSiteConfig: (site: string, c: SiteConfig) => call<SiteConfig>('PUT', `/sites/${site}/config`, c),
  alerts: (site: string) => call<{ alerts: Alert[]; kinds: string[]; mail?: boolean }>('GET', `/sites/${site}/alerts`),
  saveAlert: (site: string, a: Partial<Alert>) => call<Alert>('PUT', `/sites/${site}/alerts`, a),
  deleteAlert: (site: string, id: string) => call<void>('DELETE', `/sites/${site}/alerts/${id}`),
  testAlert: (site: string, target: string) => call<void>('POST', `/sites/${site}/alerts/test`, { target }),
  segments: (site: string) => call<{ segments: Segment[] }>('GET', `/sites/${site}/segments`),
  saveSegment: (site: string, name: string, query: string) => call<Segment>('POST', `/sites/${site}/segments`, { name, query }),
  renameSegment: (site: string, id: string, name: string) => call<Segment>('PATCH', `/sites/${site}/segments/${id}`, { name }),
  deleteSegment: (site: string, id: string) => call<void>('DELETE', `/sites/${site}/segments/${id}`),
  annotations: (site: string, from: string, to: string) => call<{ annotations: Annotation[] }>('GET', shareMode ? `/share/annotations?from=${from}&to=${to}` : `/sites/${site}/annotations?from=${from}&to=${to}`),
  addAnnotation: (site: string, day: string, text: string) => call<Annotation>('POST', `/sites/${site}/annotations`, { day, text }),
  deleteAnnotation: (site: string, id: string) => call<void>('DELETE', `/sites/${site}/annotations/${id}`),
  searchConsole: (site: string) => call<{ connected: boolean; connection?: SearchConnection }>('GET', `/sites/${site}/search-console`),
  setSearchConsole: (site: string, body: { key?: string; property?: string }) =>
    call<{ connected: boolean; connection: SearchConnection; properties?: SearchProperty[] }>('PUT', `/sites/${site}/search-console`, body),
  deleteSearchConsole: (site: string) => call<void>('DELETE', `/sites/${site}/search-console`),
  searchProperties: (site: string) => call<{ properties: SearchProperty[] }>('GET', `/sites/${site}/search-console/properties`),
  searchReport: (site: string, q: ReportQuery, dim: 'query' | 'page', signal?: AbortSignal) =>
    call<SearchReport>('GET', `/sites/${site}/report/search` + rangeQS(q) + '&dim=' + dim, undefined, signal),
  overview: (days: number, signal?: AbortSignal) => call<{ days: number; sites: SiteRow[] }>('GET', `/overview?days=${days}`, undefined, signal),
  scroll: (site: string, q: ReportQuery, signal?: AbortSignal) => call<ScrollReport>('GET', `/sites/${site}/report/scroll` + rangeQS(q) + '&limit=10', undefined, signal),
  crawlers: (site: string, q: ReportQuery) => call<CrawlerReport>('GET', `/sites/${site}/report/crawlers` + rangeQS(q)),
  vitals: (site: string, q: ReportQuery) => call<WebVitals>('GET', `/sites/${site}/report/vitals` + rangeQS(q)),
  retention: (site: string, q: ReportQuery) => call<Cohorts>('GET', `/sites/${site}/report/retention` + rangeQS(q)),
  modules: (site: string) => call<{ modules: ModuleInfo[]; script: ScriptInfo }>('GET', `/sites/${site}/modules`),
  setModule: (site: string, id: string, enabled: boolean) =>
    call<{ modules: ModuleInfo[]; script: ScriptInfo }>('PUT', `/sites/${site}/modules/${id}`, { enabled }),
  payments: (site: string) =>
    call<{ connections: PayConnection[]; providers: Provider[]; webhook_base: string; key_error?: string }>('GET', `/sites/${site}/payments`),
  connectPayments: (site: string, body: { provider: string; mode?: string; api_key?: string; secret?: string }) =>
    call<PayConnection>('POST', `/sites/${site}/payments`, body),
  disconnectPayments: (site: string, id: string) => call<void>('DELETE', `/sites/${site}/payments/${id}`),
  syncPayments: (site: string, id: string) => call<{ added: number }>('POST', `/sites/${site}/payments/${id}/sync`),
  setPaymentSecret: (site: string, id: string, secret: string) => call<void>('PATCH', `/sites/${site}/payments/${id}`, { secret }),
  paymentSecret: (site: string, id: string) => call<{ secret: string }>('GET', `/sites/${site}/payments/${id}/secret`),
  createKey: (name: string) => call<{ key: APIKey; secret: string }>('POST', '/keys', { name }),
  revokeKey: (id: string) => call<void>('DELETE', `/keys/${id}`),
}

// A tiny request cache so hovering, re-opening a period, or switching back to
// a site is instant. The server caches too; this saves the round trip.
const cache = new Map<string, { at: number; data: Report }>()
const inflight = new Map<string, Promise<Report>>()

/** Forget cached reports for a site, so the next read really asks the server. */
export function dropReports(site?: string) {
  for (const key of [...cache.keys()]) if (!site || key.startsWith(site)) cache.delete(key)
}

export function cachedReport(site: string, q: ReportQuery, maxAgeMs = 10_000): Promise<Report> {
  const key = site + reportURL(site, q)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < maxAgeMs) return Promise.resolve(hit.data)
  const running = inflight.get(key)
  if (running) return running
  const p = api
    .report(site, q)
    .then((data) => {
      cache.set(key, { at: Date.now(), data })
      if (cache.size > 64) cache.delete(cache.keys().next().value!)
      return data
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export function peekReport(site: string, q: ReportQuery): Report | undefined {
  return cache.get(site + reportURL(site, q))?.data
}
