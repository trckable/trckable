// The domain choice as one compact row in the site switcher: All, then each domain.
import { fmtInt } from '../../lib/format'
import { hostFiltered, pickedHost, shortHost } from '../../lib/domainSwitch'
import type { DomainControl } from '../../lib/domainControl'
import { domainCopy as copy } from './domainCopy'
import './DomainSwitch.css'

/** What the header says after the site's name: "All", or the domain picked. */
export function domainLabel(c: DomainControl): string {
  const picked = pickedHost(c.filters)
  return picked ? shortHost(picked, c.site) : copy.all
}

export function DomainRow({ control: c, onDone }: { control: DomainControl; onDone: () => void }) {
  const picked = pickedHost(c.filters)
  const choose = (host: string | null) => {
    onDone()
    c.onPick(host)
  }
  return (
    <div className="dom-row-box" role="radiogroup" aria-label={copy.label}>
      <span className="dom-title" aria-hidden="true">{copy.label}</span>
      <button type="button" data-stop role="radio" aria-checked={!hostFiltered(c.filters)} className={'dom-opt' + (hostFiltered(c.filters) ? '' : ' on')} onClick={() => choose(null)}>
        {copy.all}
      </button>
      {c.seen.map((r) => (
        <button key={r.value} type="button" data-stop role="radio" aria-checked={picked === r.value} className={'dom-opt' + (picked === r.value ? ' on' : '')} title={r.visitors > 0 ? copy.visitors(r.value, fmtInt(r.visitors)) : r.value} onClick={() => choose(r.value)}>
          <span className="dom-name">{shortHost(r.value, c.site)}</span>
        </button>
      ))}
    </div>
  )
}
