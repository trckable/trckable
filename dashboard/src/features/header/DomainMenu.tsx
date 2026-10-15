// After the site's name, for a site seen on more than one domain: "· All ▾", or the domain
// picked, as a small dropdown of its own: "All domains", then each domain by its short name
// with its visitors, the busiest first, the current one checked. A search appears above six
// domains. On a phone it is a bottom sheet (Popover). Single-domain sites show nothing.
import { ChevronDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Popover } from '../../kit'
import type { Row } from '../../lib/api'
import { useDomainControl, type DomainControl } from '../../lib/domainControl'
import { hostFiltered, pickedHost, shortHost } from '../../lib/domainSwitch'
import { fmtInt } from '../../lib/format'
import { domainCopy as copy } from './domainCopy'
import './DomainSwitch.css'

/** More domains than this and the list gets a search. */
const SEARCH_FROM = 6

/** What the header says after the site's name: "All", or the domain picked. */
export function domainLabel(c: DomainControl): string {
  const picked = pickedHost(c.filters)
  return picked ? shortHost(picked, c.site) : copy.all
}

function List({ c, close }: { c: DomainControl; close: () => void }) {
  const [q, setQ] = useState('')
  const picked = pickedHost(c.filters)
  const rows = useMemo(() => [...c.seen].sort((a, b) => b.visitors - a.visitors), [c.seen])
  const t = q.trim().toLowerCase()
  const shown = t ? rows.filter((r) => r.value.toLowerCase().includes(t)) : rows
  const choose = (host: string | null) => {
    close()
    c.onPick(host)
  }
  const item = (r: Row) => {
    const name = shortHost(r.value, c.site)
    return (
      <button key={r.value} type="button" role="menuitemradio" aria-checked={picked === r.value} className="menu-row dom-row" title={r.visitors > 0 ? copy.visitors(r.value, fmtInt(r.visitors)) : r.value} onClick={() => choose(r.value)}>
        <span className="dom-name">{name}</span>
        {r.visitors > 0 && <span className="faint">{fmtInt(r.visitors)}</span>}
      </button>
    )
  }
  return (
    <div className="dom-pop" role="menu" aria-label={copy.label}>
      {rows.length > SEARCH_FROM && (
        <label className="dom-search">
          <Search size={15} strokeWidth={1.75} aria-hidden="true" />
          <input type="search" placeholder={copy.search} aria-label={copy.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      )}
      <div className="dom-list">
        {!t && (
          <button type="button" role="menuitemradio" aria-checked={!hostFiltered(c.filters)} className="menu-row dom-row" onClick={() => choose(null)}>
            <span className="dom-name">{copy.allDomains}</span>
          </button>
        )}
        {shown.map(item)}
        {t && shown.length === 0 && <p className="faint dom-none">{copy.noMatch(q)}</p>}
      </div>
    </div>
  )
}

export function DomainMenu() {
  const c = useDomainControl()
  if (!c) return null
  const label = domainLabel(c)
  return (
    <Popover
      label={copy.label}
      className="menu"
      trigger={(p) => (
        <button type="button" {...p} aria-haspopup="menu" aria-label={copy.menuLabel(label)} title={label} className={'dom-btn' + (hostFiltered(c.filters) ? ' on' : '')}>
          <span className="dom-dot" aria-hidden="true">·</span>
          <span className="dom-name">{label}</span>
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => <List c={c} close={close} />}
    </Popover>
  )
}
