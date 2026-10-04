// The calls only lazy screens make (sign-in aside: account, people, keys, sharing,
// privacy, payments, a site's settings and the full-mode reports): kept apart
// from lib/api.ts so the first load does not carry them. Same shapes, same error
// handling (api.ts's call).
import { act, call, raw, rangeQS } from './api'

// Lazy screens import everything API-shaped from here: the names of lib/api, and `more`.
export * from './api'
import type { APIKey, Added, Alert, Annotation, Brand, Cohorts, CrawlerReport, FunnelResult, FunnelStep, Health, Heatmap, InstallCheck, JourneyResult, ModuleInfo, PayConnection, Person, PersonFound, PersonPayment, Profile, Provider, ReportQuery, ReportSchedule, ReportSchedules, ScriptInfo, ScrollReport, SearchConnection, SearchProperty, SearchReport, Segment, Share, ShareLook, Site, SiteAccessList, SiteConfig, SiteRow, TwoStep, WebVitals, Widget, WidgetLook } from './api'

/** A robot on one errand, and how often it came. */
export interface AiBot {
  name: string
  /** answer, train or index. */
  kind: string
  hits: number
}

/** One page's two numbers: how often AI read it, and how many visitors AI sent to it. */
export interface AiPage {
  path: string
  read: number
  sent: number
  /** Who read it, most first. */
  bots?: AiBot[]
  /** Google's clicks, when Search Console is connected. */
  clicks?: number
  /** uncredited: read, nobody sent. unread: Google ranks it, no AI robot read it. */
  flag?: 'uncredited' | 'unread'
}

/** The AI & Search tab, less Google's terms. */
export interface AiSearchReport {
  visitors: number
  referrers: { value: string; visitors: number }[]
  crawled: number
  bots: AiBot[]
  pages: AiPage[]
  /** The crawlers module is on: robots are being recorded. */
  crawlers: boolean
  /** Search Console answered: pages carry its clicks. */
  google: boolean
}

export const more = {
  me: () => call<{ kind: string; email?: string; role?: string; version?: string; keys?: Record<string, string>; update_check?: boolean; must_change?: boolean }>('GET', '/me'),
  setKeys: (keys: Record<string, string>) => call<{ keys: Record<string, string> }>('PUT', '/me/keys', { keys }),
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
  turnOffTwoStepFor: (id: string, password: string, code?: string) => act('POST', `/people/${id}/two-step/off`, { password, code }),
  startOverKeys: (password: string) => call<{ connections: number }>('POST', '/payments/start-over', { password }),
  deletePreview: (site: string) => call<Record<string, number>>('GET', `/sites/${encodeURIComponent(site)}/delete-preview`),
  widgets: (site: string) => call<{ widgets: Widget[]; base: string }>('GET', `/sites/${site}/widgets`),
  createWidget: (site: string, w: WidgetLook) => call<Widget>('POST', `/sites/${site}/widgets`, w),
  updateWidget: (site: string, id: string, w: WidgetLook & { on: boolean }) => call<Widget>('PUT', `/sites/${site}/widgets/${id}`, w),
  deleteWidget: (site: string, id: string) => act('DELETE', `/sites/${site}/widgets/${id}`),
  shares: (site: string) => call<{ shares: Share[]; base: string }>('GET', `/sites/${site}/shares`),
  updateShare: (site: string, id: string, notes: boolean) => call<{ notes: boolean }>('PATCH', `/sites/${site}/shares/${id}`, { notes }),
  createShare: (site: string, body: { name: string; password?: string; revenue: boolean; notes?: boolean; days: number; embed_origins?: string[] }) =>
    call<{ share: Share; url: string }>('POST', `/sites/${site}/shares`, body),
  deleteShare: (site: string, id: string) => act('DELETE', `/sites/${site}/shares/${id}`),
  /** A new address for a link; the old one stops working. */
  newShareAddress: (site: string, id: string) => call<{ url: string }>('POST', `/sites/${site}/shares/${id}/address`, {}),
  shareLook: (site: string) => call<ShareLook>('GET', `/sites/${site}/share-look`),
  setShareLook: (site: string, look: Pick<ShareLook, 'color' | 'hide_brand' | 'domain'>) => call<ShareLook>('PUT', `/sites/${site}/share-look`, look),
  verifyShareDomain: (site: string) => call<ShareLook>('POST', `/sites/${site}/share-look/verify`, {}),
  setShareLogo: (site: string, logo: Blob) => raw('PUT', `/sites/${site}/share-logo`, logo),
  clearShareLogo: (site: string) => call<ShareLook>('DELETE', `/sites/${site}/share-logo`),
  reportSchedules: (site: string) => call<ReportSchedules>('GET', `/sites/${site}/report-schedules`),
  saveReportSchedule: (site: string, s: Omit<ReportSchedule, 'id' | 'site_id' | 'last_sent'> & { id?: string }) =>
    call<ReportSchedule>(s.id ? 'PUT' : 'POST', `/sites/${site}/report-schedules${s.id ? '/' + s.id : ''}`, s),
  deleteReportSchedule: (site: string, id: string) => act('DELETE', `/sites/${site}/report-schedules/${id}`),
  testReportSchedule: (site: string, id: string) => call<{ sent_to: string }>('POST', `/sites/${site}/report-schedules/${id}/test`, {}),
  people: () => call<{ people: Person[] }>('GET', '/people'),
  addPerson: (email: string, role: string) => call<Added>('POST', '/people', { email, role }),
  setPersonRole: (id: string, role: string) => call<{ people: Person[] }>('PATCH', `/people/${id}`, { role }),
  removePerson: (id: string) => act('DELETE', `/people/${id}`),
  siteAccess: () => call<SiteAccessList>('GET', '/site-access'),
  setSiteAccess: (id: string, sites: string[] | null) => call<SiteAccessList>('PUT', `/site-access/${id}`, { sites }),
  setSiteIcon: (site: string, picture: Blob) => raw('PUT', `/sites/${site}/icon`, picture),
  clearSiteIcon: (site: string) => call<Brand>('DELETE', `/sites/${site}/icon`),
  fetchSiteFavicon: (site: string) => call<Brand>('POST', `/sites/${site}/icon/favicon`),
  setSiteColor: (site: string, color: string) => call<Brand>('PUT', `/sites/${site}/color`, { color }),
  resetPersonPassword: (id: string, password: string, code?: string) => call<{ email: string; password: string }>('POST', `/people/${id}/password`, { password, code }),
  changePassword: (current: string, password: string) => act('POST', '/account/password', { current, password }),
  twoStep: () => call<TwoStep>('GET', '/account/2fa'),
  startTwoStep: (password: string, code?: string) => call<{ secret: string; uri: string }>('POST', '/account/2fa/start', { password, code }),
  enableTwoStep: (password: string, code: string) => call<{ recovery: string[] }>('POST', '/account/2fa/enable', { password, code }),
  // While two-step is on, changing it needs a code from the app (or a recovery code) as well.
  disableTwoStep: (password: string, code: string) => act('POST', '/account/2fa/disable', { password, code }),
  health: () => call<Health>('GET', '/health'),
  setName: (name: string) => call<Profile>('PATCH', '/account', { name }),
  setAvatar: (file: Blob) => raw('PUT', '/account/avatar', file),
  clearAvatar: () => act('DELETE', '/account/avatar'),
  /** This server reads the site's homepage and looks for the snippet. */
  checkInstall: (site: string) => call<InstallCheck>('POST', `/sites/${encodeURIComponent(site)}/install/check`),
  keys: () => call<{ keys: APIKey[] }>('GET', '/keys'),
  heatmap: (site: string, q: ReportQuery) => call<Heatmap>('GET', `/sites/${site}/report/heatmap` + rangeQS(q)),
  funnel: (site: string, q: ReportQuery, steps: FunnelStep[]) => call<{ steps: FunnelResult[] }>('GET', `/sites/${site}/report/funnel` + rangeQS(q) + '&steps=' + encodeURIComponent(JSON.stringify(steps))),
  journey: (site: string, visitor: string, q: ReportQuery) => call<JourneyResult>('GET', `/sites/${site}/journey/${visitor}` + rangeQS(q)),
  siteConfig: (site: string) => call<SiteConfig>('GET', `/sites/${site}/config`),
  setSiteConfig: (site: string, c: SiteConfig) => call<SiteConfig>('PUT', `/sites/${site}/config`, c),
  alerts: (site: string) => call<{ alerts: Alert[]; kinds: string[]; mail?: boolean }>('GET', `/sites/${site}/alerts`),
  saveAlert: (site: string, a: Partial<Alert>) => call<Alert>('PUT', `/sites/${site}/alerts`, a),
  testAlert: (site: string, target: string) => act('POST', `/sites/${site}/alerts/test`, { target }),
  saveSegment: (site: string, name: string, query: string) => call<Segment>('POST', `/sites/${site}/segments`, { name, query }),
  addAnnotation: (site: string, day: string, text: string) => call<Annotation>('POST', `/sites/${site}/annotations`, { day, text }),
  updateAnnotation: (site: string, id: string, day: string, text: string) => call<Annotation>('PATCH', `/sites/${site}/annotations/${id}`, { day, text }),
  deleteAnnotation: (site: string, id: string) => act('DELETE', `/sites/${site}/annotations/${id}`),
  searchConsole: (site: string) => call<{ connected: boolean; connection?: SearchConnection }>('GET', `/sites/${site}/search-console`),
  setSearchConsole: (site: string, body: { key?: string; property?: string }) =>
    call<{ connected: boolean; connection: SearchConnection; properties?: SearchProperty[] }>('PUT', `/sites/${site}/search-console`, body),
  deleteSearchConsole: (site: string) => act('DELETE', `/sites/${site}/search-console`),
  searchProperties: (site: string) => call<{ properties: SearchProperty[] }>('GET', `/sites/${site}/search-console/properties`),
  searchReport: (site: string, q: ReportQuery, dim: 'query' | 'page', signal?: AbortSignal) =>
    call<SearchReport>('GET', `/sites/${site}/report/search` + rangeQS(q) + '&dim=' + dim, undefined, signal),
  overview: (days: number, signal?: AbortSignal) => call<{ days: number; sites: SiteRow[] }>('GET', `/overview?days=${days}`, undefined, signal),
  scroll: (site: string, q: ReportQuery, signal?: AbortSignal) => call<ScrollReport>('GET', `/sites/${site}/report/scroll` + rangeQS(q) + '&limit=10', undefined, signal),
  aiSearch: (site: string, q: ReportQuery, limit: number, signal?: AbortSignal) =>
    call<AiSearchReport>('GET', `/sites/${site}/report/ai-search` + rangeQS(q) + `&limit=${limit}`, undefined, signal),
  aiSeen: (site: string) => call<{ visitor: boolean; crawler: boolean }>('GET', `/sites/${site}/report/ai-seen`),
  crawlers: (site: string, q: ReportQuery) => call<CrawlerReport>('GET', `/sites/${site}/report/crawlers` + rangeQS(q)),
  vitals: (site: string, q: ReportQuery) => call<WebVitals>('GET', `/sites/${site}/report/vitals` + rangeQS(q)),
  retention: (site: string, q: ReportQuery) => call<Cohorts>('GET', `/sites/${site}/report/retention` + rangeQS(q)),
  setModule: (site: string, id: string, enabled: boolean) =>
    call<{ modules: ModuleInfo[]; script: ScriptInfo }>('PUT', `/sites/${site}/modules/${id}`, { enabled }),
  payments: (site: string) =>
    call<{ connections: PayConnection[]; providers: Provider[]; webhook_base: string; key_error?: string }>('GET', `/sites/${site}/payments`),
  connectPayments: (site: string, body: { provider: string; mode?: string; api_key?: string; secret?: string }) =>
    call<PayConnection>('POST', `/sites/${site}/payments`, body),
  disconnectPayments: (site: string, id: string) => act('DELETE', `/sites/${site}/payments/${id}`),
  syncPayments: (site: string, id: string) => call<{ added: number }>('POST', `/sites/${site}/payments/${id}/sync`),
  setPaymentSecret: (site: string, id: string, secret: string) => act('PATCH', `/sites/${site}/payments/${id}`, { secret }),
  paymentSecret: (site: string, id: string) => call<{ secret: string }>('GET', `/sites/${site}/payments/${id}/secret`),
  createKey: (name: string) => call<{ key: APIKey; secret: string }>('POST', '/keys', { name }),
  revokeKey: (id: string) => act('DELETE', `/keys/${id}`),
}
