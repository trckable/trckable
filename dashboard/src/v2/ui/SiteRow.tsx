// One site in the list that opens from the header: its mark with the state dot on it (green while visits come, grey when quiet, red when down, hollow
// when not installed), its name (its domain too, when another site has the same name), and today's visitors, or how long it has been quiet or down. Anyone who may arrange can drag the row, move it with Alt + ↑/↓ or its ⋯ menu (pin, a group).
import { Fragment } from 'react'
import { ExternalLink, GripVertical } from 'lucide-react'
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

/** The short word and the tip of a down or quiet site; a quiet one with no visit on record (imported history, a script seen) has no span to tell. */
function stateWords(s: Site, down: boolean): [string, string | undefined] {
  const span = silence(s)
  if (down) return [copy.downShort(span), copy.downTip(span)]
  return span ? [copy.quietShort(span), copy.quietTip(span)] : [copy.noLiveVisits, undefined]
}

/** What stands where the people on it would: "setup", or in words how long it has been down or quiet (a quiet one's dot is grey, a down one's red); else today's visitors. */
function Tail({ s, today }: { s: Site; today?: number }) {
  const state = dotState(s)
  if (state === 'new') {
    return (
      <span className="now unverified" title={copy.notVerifiedTip}>
        {copy.notVerified}
      </span>
    )
  }
  if (state === 'stopped' || state === 'quiet') {
    const down = state === 'stopped'
    const [word, tip] = stateWords(s, down)
    return (
      <span className={`now state-word ${down ? 'down' : 'quiet'}`} title={tip}>
        {word}
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

export function SiteRow({ site, place, on, arrange: a, today, onPick, move, clash, settings, status }: { settings?: (tab: 'site' | 'install' | 'sharing' | 'widgets') => void; status?: () => void; clash?: boolean; move?: SiteMove; site: Site; place: Place; on: boolean; arrange: Arrange | null; today?: number; onPick: () => void }) {
  const name = site.name || site.domain
  // The domain says which is which only when two names are alike.
  const note = clash && site.domain !== name ? site.domain : undefined
  const moveStep = (dir: -1 | 1) => {
    if (!a) return
    const next = step(a.sites, a.layout, site.id, dir)
    if (next === a.layout) return
    const at = sectionsOf(a.sites, next).find((x) => x.sites.some((y) => y.id === site.id))?.sites.findIndex((y) => y.id === site.id) ?? -1
    a.save(next, at < 0 ? undefined : copy.movedTo(name, at + 1))
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
        <button type="button" data-stop data-nodrag className="btn sw-stop" aria-label={move.stopLabel} onClick={move.stop}>
          {move.stopWord}
        </button>
      )}
      <div className="site-acts">
        <OpenSite domain={site.domain} />
        <RowMenu site={site} place={place} a={a} step={moveStep} settings={settings} status={status} />
      </div>
    </li>
  )
}

/** The row's ⋯ in three groups with a thin line between: Site settings (Install help while nothing is verified) and Open site (the ↗ is hidden on touch); Share, Status page, Widgets; then the ways to arrange. */
export function RowMenu({ site, place, a, step: moveStep, settings, status }: { site: Site; place: Place; a: Arrange | null; step: (dir: -1 | 1) => void; settings?: (tab: 'site' | 'install' | 'sharing' | 'widgets') => void; status?: () => void }) {
  const here = placeKey(place)
  const sec = a ? sectionsOf(a.sites, a.layout).find((x) => x.sites.some((s) => s.id === site.id)) : undefined
  const at = sec ? sec.sites.findIndex((s) => s.id === site.id) : -1
  const canUp = at > 0
  const canDown = sec ? at >= 0 && at < sec.sites.length - 1 : true
  const go = (to: Place, said: string) => a?.save(moveTo(a.sites, a.layout, site.id, to), said)
  const newGroup = async () => {
    if (!a) return
    const name = (await confirmWith({ title: copy.newGroupTitle, body: copy.newGroupBody, confirmLabel: copy.create, field: { label: copy.groupName, type: 'text' } }))?.trim()
    if (!name) return
    const l = addGroup(a.layout, name)
    a.save(moveTo(a.sites, l, site.id, { kind: 'group', name }), copy.toGroup(name))
  }
  if (!settings && !status && !site.domain && !a) return null
  return (
    <Menu label={copy.options(site.name || site.domain)}>
      {(close) => {
        const item = (label: string, fn: () => void) => (
          <button type="button" role="menuitem" onClick={() => { close(); fn() }}>
            {label}
          </button>
        )
        const groups = [
          [
            settings && item(copy.siteSettings, () => settings('site')),
            settings && dotState(site) === 'new' && item(copy.installHelp, () => settings('install')),
            site.domain && (
              <button type="button" role="menuitem" className="open-touch" onClick={() => { close(); openSiteTab(site.domain) }}>
                <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                <span className="menu-label">{copy.openSite(site.domain)}</span>
              </button>
            ),
          ],
          [settings && item(copy.share, () => settings('sharing')), status && item(copy.statusPage, status), settings && item(copy.widgets, () => settings('widgets'))],
          a && [
            place.kind === 'pinned' ? item(copy.unpin, () => a.save(unpin(a.sites, a.layout, site.id), copy.unpin)) : item(copy.pin, () => a.save(pin(a.sites, a.layout, site.id), copy.pin)),
            canUp && item(copy.up, () => moveStep(-1)),
            canDown && item(copy.down, () => moveStep(1)),
            ...a.layout.groups
              .filter((g) => placeKey({ kind: 'group', name: g.name }) !== here)
              .map((g) => item(copy.toGroup(g.name), () => go({ kind: 'group', name: g.name }, copy.toGroup(g.name)))),
            place.kind === 'group' && item(copy.noGroup, () => go({ kind: 'rest' }, copy.noGroup)),
            item(copy.newGroup, () => void newGroup()),
          ],
        ]
        // Three groups with a thin line between; a group the role leaves empty takes its line with it.
        return (
          <>
            {groups
              .map((g) => (g || []).filter(Boolean))
              .filter((g) => g.length > 0)
              .map((g, i) => (
                <Fragment key={i}>
                  {i > 0 && <div role="separator" className="menu-sep" />}
                  {g}
                </Fragment>
              ))}
          </>
        )
      }}
    </Menu>
  )
}
