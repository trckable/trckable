// A site seen on more than one domain: "All domains", then each by its short name with its visitors, the busiest first, the
// one picked checked. It is the list that opens from the header, a section of its own under the site's name.
import { useMemo, useState } from 'react'
import type { Row } from '../../lib/api'
import type { DomainControl } from '../../lib/domainControl'
import { hostFiltered, pickedHost, shortHost } from '../../lib/domainSwitch'
import { fmtInt } from '../../lib/format'
import { domainCopy as copy } from '../../features/header/domainCopy'

/** What the header says after the site's name: nothing for all, or the domain picked. */
export function domainLabel(c: DomainControl): string | null {
  const picked = pickedHost(c.filters)
  return picked ? shortHost(picked, c.site) : null
}

/** More domains than this and the section gets a search. */
const SEARCH_FROM = 6

export function DomainRows({ c, close }: { c: DomainControl; close: () => void }) {
  const [q, setQ] = useState('')
  const picked = pickedHost(c.filters)
  const rows = useMemo(() => [...c.seen].sort((a, b) => b.visitors - a.visitors), [c.seen])
  const t = q.trim().toLowerCase()
  const shown = t ? rows.filter((r) => r.value.toLowerCase().includes(t)) : rows
  const choose = (host: string | null) => {
    close()
    c.onPick(host)
  }
  const item = (r: Row) => (
    <button key={r.value} type="button" role="menuitemradio" aria-checked={picked === r.value} className="mi dom-row" title={r.visitors > 0 ? copy.visitors(r.value, fmtInt(r.visitors)) : r.value} onClick={() => choose(r.value)}>
      <span className="mt2">
        <div className="nm">{shortHost(r.value, c.site)}</div>
      </span>
      {r.visitors > 0 && <span className="now">{fmtInt(r.visitors)}</span>}
    </button>
  )
  return (
    <div className="sites-domains" role="menu" aria-label={copy.label}>
      {rows.length > SEARCH_FROM && <input type="search" placeholder={copy.search} aria-label={copy.search} value={q} onChange={(e) => setQ(e.target.value)} />}
      {!t && (
        <button type="button" role="menuitemradio" aria-checked={!hostFiltered(c.filters)} className="mi dom-row" onClick={() => choose(null)}>
          <span className="mt2">
            <div className="nm">{copy.allDomains}</div>
          </span>
        </button>
      )}
      {shown.map(item)}
      {t && shown.length === 0 && <p className="mk-quiet">{copy.noMatch(q)}</p>}
    </div>
  )
}
