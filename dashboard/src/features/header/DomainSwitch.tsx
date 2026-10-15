// Next to the site's name, for a site seen on more than one domain: All, then
// each domain. It is the "Domain is …" filter in another place: the address
// holds the one state, so the chip row and this control always agree. On a
// phone it is one chip with a menu.
import { ChevronDown } from 'lucide-react'
import { Popover } from '../../kit'
import type { Filter, Row } from '../../lib/api'
import { hostFiltered, pickedHost, shortHost, split } from '../../lib/domainSwitch'
import { fmtInt } from '../../lib/format'
import { domainCopy as copy } from './domainCopy'
import './DomainSwitch.css'

export interface DomainSwitchProps {
  /** The report's list of domains, when it carries one (two or more seen). */
  seen: Row[] | null
  filters: Filter[]
  site: string
  narrow: boolean
  /** A domain, or null for all. */
  onPick: (host: string | null) => void
}

export function DomainSwitch({ seen, filters, site, narrow, onPick }: DomainSwitchProps) {
  const rows = seen ?? []
  if (rows.length === 0) return null
  const picked = pickedHost(filters)
  const name = (r: Row) => shortHost(r.value, site)
  const tip = (r: Row) => (r.visitors > 0 ? copy.visitors(r.value, fmtInt(r.visitors)) : r.value)
  const item = (r: Row, close: () => void) => (
    <button key={r.value} type="button" role="menuitemradio" aria-checked={picked === r.value} className="menu-row dom-row" title={tip(r)} onClick={() => { close(); onPick(r.value) }}>
      <span className="dom-name">{name(r)}</span>
      {r.visitors > 0 && <span className="faint">{fmtInt(r.visitors)}</span>}
    </button>
  )
  const menu = (label: string, on: boolean, list: Row[], withAll: boolean) => (
    <Popover
      label={copy.label}
      className="menu"
      trigger={(p) => (
        <button type="button" {...p} aria-haspopup="menu" className={'dom-btn dom-menu' + (on ? ' on' : '')}>
          <span className="dom-name">{label}</span>
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <div className="menu-list" role="menu" aria-label={copy.label}>
          {withAll && (
            <button type="button" role="menuitemradio" aria-checked={!hostFiltered(filters)} className="menu-row dom-row" onClick={() => { close(); onPick(null) }}>
              <span className="dom-name">{copy.allDomains}</span>
            </button>
          )}
          {list.map((r) => item(r, close))}
        </div>
      )}
    </Popover>
  )
  if (narrow) {
    const now = rows.find((r) => r.value === picked)
    return <div className="dom-switch" role="group" aria-label={copy.label}>{menu(now ? name(now) : copy.allDomains, !!now, rows, true)}</div>
  }
  const { shown, rest } = split(rows)
  const inRest = rest.find((r) => r.value === picked)
  return (
    <div className="dom-switch" role="radiogroup" aria-label={copy.label}>
      <button type="button" role="radio" aria-checked={!hostFiltered(filters)} className={'dom-btn' + (hostFiltered(filters) ? '' : ' on')} onClick={() => onPick(null)}><span className="dom-name">{copy.all}</span></button>
      {shown.map((r) => (
        <button key={r.value} type="button" role="radio" aria-checked={picked === r.value} title={tip(r)} className={'dom-btn' + (picked === r.value ? ' on' : '')} onClick={() => onPick(r.value)}><span className="dom-name">{name(r)}</span></button>
      ))}
      {rest.length > 0 && menu(inRest ? name(inRest) : copy.more, !!inRest, rest, false)}
    </div>
  )
}
