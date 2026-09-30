// One site in the switcher: its mark and state dot, today's visitors, a click
// to open it, and (for anyone who may arrange) a drag handle's worth of row,
// Alt + ↑/↓, and a ⋯ menu with every move, so a phone and a keyboard can do
// what a mouse does.
import { Check } from 'lucide-react'
import { stoppedWhy, type Site } from '../../lib/api'
import { Menu } from '../../components/Menu'
import { SiteMark } from '../../components/SiteMark'
import { confirmWith } from '../../components/Confirm'
import { fmtCompact, fmtInt } from '../../lib/format'
import { copy } from './menuCopy'
import { copy as first } from './copy'
import { addGroup, moveTo, pin, placeKey, step, unpin, type Place } from './layout'
import { dotState, StateDot } from './StateDot'
import type { Arrange } from './SiteMenu'
import { DRAG, dragging } from './drag'
import { MARK, type Density } from './density'
import { prefetchSite } from '../../lib/dashQuery'
import './SiteItem.css'

/**
 * What stands where the number would: "setup" or "stopped" when the dot alone
 * can't say it, else today's visitors (nothing until they are loaded).
 */
function Tail({ s, today }: { s: Site; today?: number }) {
  switch (dotState(s)) {
    case 'new':
      return <span className="tail faint" title={first.dot.new}>{copy.setup}</span>
    case 'stopped':
      return <span className="tail stopped-note" title={stoppedWhy(s)}>{copy.stopped}</span>
    default:
      return today === undefined ? null : <span className={today ? 'tail' : 'tail faint'} title={copy.today(fmtInt(today))}>{fmtCompact(today)}</span>
  }
}

/** After a move React may re-insert the row, which drops focus: put it back. */
function refocus(id: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-site="${CSS.escape(id)}"] .site`)?.focus())
}

export function SiteItem({ site, place, on, arrange, today, key1, density = 'compact', onPick }: { site: Site; place: Place; on: boolean; arrange: Arrange | null; today?: number; key1?: number; density?: Density; onPick: () => void }) {
  const name = site.name || site.domain
  const a = arrange
  const moveStep = (dir: -1 | 1) => {
    if (!a) return
    a.save(step(a.sites, a.layout, site.id, dir), dir < 0 ? copy.up : copy.down)
    refocus(site.id)
  }
  return (
    <li
      data-site={site.id}
      className={a?.drag === site.id ? 'site-row dragging' : 'site-row'}
      draggable={!!a}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData(DRAG, site.id)
        // Restyled a frame later: changing the row as the drag starts makes
        // Safari drop the drag.
        requestAnimationFrame(() => a?.setDrag(site.id))
      }}
      onDragEnd={() => a?.setDrag(null)}
      onDragOver={(e) => a && dragging(e) && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const id = e.dataTransfer.getData(DRAG)
        a?.setDrag(null)
        if (!a || !id || id === site.id) return
        a.save(moveTo(a.sites, a.layout, id, place, site.id))
      }}
    >
      <button
        type="button"
        data-stop
        aria-current={on ? 'page' : undefined}
        className={on ? 'site on' : 'site'}
        title={site.domain}
        onClick={onPick}
        onPointerEnter={on ? undefined : () => prefetchSite(site)}
        onFocus={on ? undefined : () => prefetchSite(site)}
        onKeyDown={(e) => {
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
          e.preventDefault()
          moveStep(e.key === 'ArrowUp' ? -1 : 1)
        }}
      >
        <span className="mark-wrap">
          <SiteMark site={site} size={MARK[density]} />
          <StateDot site={site} />
        </span>
        <span className="name">
          <b>{name}</b>
        </span>
        <span className="right">
          <Tail s={site} today={today} />
          {key1 && <kbd className="site-key" aria-hidden="true">{key1}</kbd>}
        </span>
        <span className="tick" aria-hidden="true">{on && <Check size={14} strokeWidth={2.25} />}</span>
      </button>
      {a && <Moves site={site} place={place} a={a} step={moveStep} />}
    </li>
  )
}

function Moves({ site, place, a, step: moveStep }: { site: Site; place: Place; a: Arrange; step: (dir: -1 | 1) => void }) {
  const here = placeKey(place)
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
            {item(copy.up, () => moveStep(-1))}
            {item(copy.down, () => moveStep(1))}
            {place.kind === 'pinned' ? item(copy.unpin, () => a.save(unpin(a.sites, a.layout, site.id), copy.unpin)) : item(copy.pin, () => a.save(pin(a.sites, a.layout, site.id), copy.pin))}
            {a.layout.groups
              .filter((g) => placeKey({ kind: 'group', name: g.name }) !== here)
              .map((g) => (
                <button key={g.name} type="button" role="menuitem" onClick={() => { close(); go({ kind: 'group', name: g.name }, copy.toGroup(g.name)) }}>
                  {copy.toGroup(g.name)}
                </button>
              ))}
            {place.kind === 'group' && item(copy.noGroup, () => go({ kind: 'rest' }, copy.noGroup))}
            {item(copy.newGroup, () => void newGroup())}
          </>
        )
      }}
    </Menu>
  )
}
