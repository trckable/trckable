// One site in the list that opens from the header: its mark with the state dot on it (green while visits come, grey when quiet, red when down, hollow
// when not installed), its name (its domain too, when another site has the same name), and today's visitors, or how long it has been quiet or down. Anyone who may arrange can drag the row, move it with Alt + ↑/↓ or its ⋯ menu (pin, a group).
import { GripVertical } from 'lucide-react'
import type { Site } from '../../lib/api'
import { Menu } from '../../components/Menu'
import { confirmWith } from '../../components/Confirm'
import { fmtCompact, fmtInt } from '../../lib/format'
import { prefetchSite } from '../../lib/dashQuery'
import { copy } from '../../features/sites/menuCopy'
import { copy as first } from '../../features/sites/copy'
import { addGroup, moveTo, pin, placeKey, sectionsOf, step, unpin, type Place } from '../../features/sites/layout'
import { dotState } from '../../features/sites/StateDot'
import { OpenSite, openSiteTab } from '../../features/sites/OpenSite'
import { silence } from '../../features/sitestatus/time'
import type { Arrange } from '../../features/sites/arrange'
import { SiteMark } from '../../components/SiteMark'
import type { SiteMove } from '../slots'

const DOT = { now: 'now', live: '', quiet: 'quiet', stopped: 'down', new: 'off' } as const

/** What stands where the people on it would: "setup", or in words how long it has been down or quiet (a quiet one's dot is grey, a down one's red); else today's visitors. */
function Tail({ s, today }: { s: Site; today?: number }) {
  const state = dotState(s)
  if (state === 'new') {
    return (
      <span className="now" title={first.dot.new}>
        {copy.setup}
      </span>
    )
  }
  if (state === 'stopped' || state === 'quiet') {
    const down = state === 'stopped'
    return (
      <span className={`now state-word ${down ? 'down' : 'quiet'}`} title={down ? copy.downTip(silence(s)) : copy.quietTip(silence(s))}>
        {down ? copy.downShort(silence(s)) : copy.quietShort(silence(s))}
      </span>
    )
  }
  if (today === undefined) return null
  return (
    <span className="now" title={copy.today(fmtInt(today))}>
      <b>{fmtCompact(today)}</b>
    </span>
  )
}

/** The dot's class: only a real problem is coloured, so a quiet site's is grey. */
const dot = (s: Site) => (dotState(s) === 'quiet' ? 'idle' : DOT[dotState(s)])

/** After a move React may re-insert the row, which drops focus: put it back. */
function refocus(id: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-site="${CSS.escape(id)}"] .site`)?.focus())
}

export function SiteRow({ site, place, on, arrange: a, today, onPick, move, clash }: { clash?: boolean; move?: SiteMove; site: Site; place: Place; on: boolean; arrange: Arrange | null; today?: number; onPick: () => void }) {
  const name = site.name || site.domain
  // The domain says which is which only when two names are alike.
  const note = clash && site.domain !== name ? site.domain : undefined
  const moveStep = (dir: -1 | 1) => {
    if (!a) return
    a.save(step(a.sites, a.layout, site.id, dir), dir < 0 ? copy.up : copy.down)
    refocus(site.id)
  }
  return (
    <li data-site={site.id} className={['site-row', a && 'sortable', a?.drag === site.id && 'dragging'].filter(Boolean).join(' ')} onPointerDown={(e) => a?.grab(e, site.id)} onDragStart={(e) => e.preventDefault()}>
      {a && <GripVertical className="grip" size={12} strokeWidth={2.25} aria-hidden="true" />}
      <button
        type="button"
        data-stop
        aria-current={on ? 'page' : undefined}
        className={['mi', 'site', on && 'on'].filter(Boolean).join(' ')}
        onClick={onPick}
        onPointerEnter={on ? undefined : () => prefetchSite(site)}
        onFocus={on ? undefined : () => prefetchSite(site)}
        onKeyDown={(e) => {
          if (e.shiftKey && e.key === 'Enter' && site.domain) {
            e.preventDefault()
            openSiteTab(site.domain)
            return
          }
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
          e.preventDefault()
          moveStep(e.key === 'ArrowUp' ? -1 : 1)
        }}
      >
        <span className="mkwrap">
          <SiteMark site={site} size={22} />
          <span className={`mk-dot ${move ? 'quiet' : dot(site)}`} title={move?.title ?? first.dot[dotState(site)]} />
        </span>
        <span className="mt2">
          <div className="nm">{name}</div>
          {move ? <div className="d state-line quiet moving" title={move.title}>{move.text}</div> : note && <div className="d">{note}</div>}
        </span>
        <Tail s={site} today={today} />
      </button>
      {move && (
        <button type="button" data-stop className="btn sw-stop" aria-label={move.stopLabel} onClick={move.stop}>
          {move.stopWord}
        </button>
      )}
      <OpenSite domain={site.domain} />
      {a && <Moves site={site} place={place} a={a} step={moveStep} />}
    </li>
  )
}

export function Moves({ site, place, a, step: moveStep }: { site: Site; place: Place; a: Arrange; step: (dir: -1 | 1) => void }) {
  const here = placeKey(place)
  const sec = sectionsOf(a.sites, a.layout).find((x) => x.sites.some((s) => s.id === site.id))
  const at = sec ? sec.sites.findIndex((s) => s.id === site.id) : -1
  const canUp = at > 0
  const canDown = sec ? at >= 0 && at < sec.sites.length - 1 : true
  const go = (to: Place, said: string) => a.save(moveTo(a.sites, a.layout, site.id, to), said)
  const newGroup = async () => {
    const name = (await confirmWith({ title: copy.newGroupTitle, body: copy.newGroupBody, confirmLabel: copy.create, field: { label: copy.groupName, type: 'text' } }))?.trim()
    if (!name) return
    const l = addGroup(a.layout, name)
    a.save(moveTo(a.sites, l, site.id, { kind: 'group', name }), copy.toGroup(name))
  }
  return (
    <Menu label={copy.options(site.name || site.domain)}>
      {(close) => {
        const item = (label: string, fn: () => void) => (
          <button type="button" role="menuitem" onClick={() => { close(); fn() }}>
            {label}
          </button>
        )
        return (
          <>
            {canUp && item(copy.up, () => moveStep(-1))}
            {canDown && item(copy.down, () => moveStep(1))}
            {place.kind === 'pinned' ? item(copy.unpin, () => a.save(unpin(a.sites, a.layout, site.id), copy.unpin)) : item(copy.pin, () => a.save(pin(a.sites, a.layout, site.id), copy.pin))}
            {a.layout.groups
              .filter((g) => placeKey({ kind: 'group', name: g.name }) !== here)
              .map((g) => item(copy.toGroup(g.name), () => go({ kind: 'group', name: g.name }, copy.toGroup(g.name))))}
            {place.kind === 'group' && item(copy.noGroup, () => go({ kind: 'rest' }, copy.noGroup))}
            {item(copy.newGroup, () => void newGroup())}
          </>
        )
      }}
    </Menu>
  )
}
