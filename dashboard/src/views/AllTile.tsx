// One site on All sites: its state, name, visitors with the move, a small line
// of the days, revenue when the site has payments, and one quiet line saying
// what is going on. The whole tile opens the site (a site that never had a
// visit opens its install tab); a ⋯ menu moves it to a group.
import { Menu } from '../components/Menu'
import { confirmWith } from '../components/Confirm'
import { StateDot } from '../features/sites/StateDot'
import { addGroup, moveTo, placeKey, placeOf, type Place } from '../features/sites/layout'
import { copy as menu } from '../features/sites/menuCopy'
import { statusOf } from '../features/sitestatus/status'
import { silence } from '../features/sitestatus/time'
import { tag as locale } from '../i18n'
import { delta, fmtInt, fmtMoney } from '../lib/format'
import type { Site, SiteLayout, SiteRow } from '../lib/api'
import { openSettings } from '../lib/settings'
import { navigate } from '../lib/url'
import { openSiteTab } from '../features/sites/OpenSite'
import { Spark } from './AllSitesSpark'
import { copy } from './allSitesCopy'
import { fromStart, hasPayments } from './allSitesLogic'

/** What the viewer may do to the arrangement; none for a viewer. */
export interface Arrange {
  sites: Site[]
  layout: SiteLayout
  save: (l: SiteLayout) => void
}

type Props = {
  row: SiteRow
  site: Site | undefined
  color: string
  days: number
  start: number
  arrange: Arrange | null
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropHere: () => void
}
/** Shift + Enter opens the site's own address, as in the switcher. */
export function openOnShiftEnter(e: Pick<React.KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>, domain: string) {
  if (!e.shiftKey || e.key !== 'Enter' || !domain) return
  e.preventDefault()
  openSiteTab(domain)
}

/** A day as the tile says it: the weekday within the last week, else the date. */
function dayOf(unix: number): string {
  const d = new Date(unix * 1000)
  const recent = Date.now() - d.getTime() < 6 * 864e5
  return d.toLocaleDateString(locale, recent ? { weekday: 'short' } : { day: 'numeric', month: 'short' })
}

/** The one line under the numbers: what is true of this site, never a guess at why. */
function whyLine(r: SiteRow, site: Site | undefined, days: number): string {
  if (r.error) return copy.unread
  const status = site ? statusOf(site) : 'ok'
  if (status === 'new' && !r.visitors && !r.previous_visitors) return copy.waiting
  if ((status === 'down' || status === 'quiet') && site?.last_event_at) return copy.silent(dayOf(site.last_event_at))
  if (r.previous_visitors > 0) {
    const d = (r.visitors - r.previous_visitors) / r.previous_visitors
    if (d >= 0.1) return copy.upOn(days)
    if (d <= -0.1) return copy.downOn(days)
  }
  return copy.steady
}

export function tagOf(site: Site | undefined): string | null {
  const status = site ? statusOf(site) : 'ok'
  if (status === 'down') return copy.downTag
  return status === 'quiet' && site ? copy.quietTag(silence(site)) : null
}

function Move({ site, a }: { site: Site; a: Arrange }) {
  const here = placeKey(placeOf(site.id, a.layout))
  const go = (to: Place) => a.save(moveTo(a.sites, a.layout, site.id, to))
  const fresh = async () => {
    const name = (await confirmWith({ title: menu.newGroupTitle, body: menu.newGroupBody, confirmLabel: menu.create, field: { label: menu.groupName, type: 'text' } }))?.trim()
    if (name) a.save(moveTo(a.sites, addGroup(a.layout, name), site.id, { kind: 'group', name }))
  }
  return (
    <Menu label={copy.arrange(site.name || site.domain)}>
      {(close) => {
        const item = (label: string, fn: () => void, key = label) => (
          <button key={key} type="button" role="menuitem" onClick={() => { close(); fn() }}>
            {label}
          </button>
        )
        return (
          <>
            {a.layout.groups.filter((g) => placeKey({ kind: 'group', name: g.name }) !== here).map((g) => item(menu.toGroup(g.name), () => go({ kind: 'group', name: g.name })))}
            {here.startsWith('g:') && item(menu.noGroup, () => go({ kind: 'rest' }))}
            {item(menu.newGroup, () => void fresh())}
          </>
        )
      }}
    </Menu>
  )
}

export function AllTile({ row: r, site, color, days, start, arrange, dragging, onDragStart, onDragEnd, onDropHere }: Props) {
  // Never a visit, then or now: imported history counts as visits even when no live one has come.
  const fresh = !r.error && site !== undefined && statusOf(site) === 'new' && !r.visitors && !r.previous_visitors
  const go = () => (fresh ? openSettings(r, 'install') : navigate('/' + encodeURIComponent(r.domain)))
  const d = fresh || r.error ? null : delta(r.visitors, r.previous_visitors)
  const tag = tagOf(site)
  const why = whyLine(r, site, days)
  const paid = hasPayments(r) && (r.revenue ?? 0) > 0
  return (
    <div
      role="listitem"
      className={'all-tile' + (dragging ? ' dragging' : '')}
      data-site={r.id}
      draggable={arrange !== null}
      onDragStart={arrange ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); onDragStart() } : undefined}
      onDragEnd={arrange ? onDragEnd : undefined}
      onDragOver={arrange ? (e) => e.preventDefault() : undefined}
      onDrop={arrange ? (e) => { e.preventDefault(); e.stopPropagation(); onDropHere() } : undefined}
    >
      <button type="button" className="all-tile-go" onClick={go} onKeyDown={(e) => openOnShiftEnter(e, r.domain)}>
        <span className="all-tile-top">
          {site && <StateDot site={site} />}
          <b className="all-tile-name" title={r.domain}>{r.name || r.domain}</b>
          {tag && <small className="all-tile-tag">{tag}</small>}
          {paid && <span className="all-tile-money">{fmtMoney(r.revenue ?? 0, r.currency, r.exponent)}</span>}
        </span>
        {!fresh && !r.error && (
          <span className="all-tile-num">
            <b>{fmtInt(r.visitors)}</b>
            {d && <span className={'delta ' + d.tone}>{d.text}</span>}
          </span>
        )}
        {!fresh && !r.error && r.visitors > 0 && <Spark values={fromStart(r.series, start)} color={color} h={30} />}
        <span className="all-tile-why muted">
          {why}
          {fresh && <> · <b>{copy.install}</b></>}
        </span>
      </button>
      {arrange && site && (
        <span className="all-tile-menu">
          <Move site={site} a={arrange} />
        </span>
      )}
    </div>
  )
}
