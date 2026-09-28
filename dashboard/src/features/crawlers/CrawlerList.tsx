// The crawlers of one kind: the legend, and a toggle for each line.
import type { CrawlerReport } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { colorOf } from './colors'

type Series = CrawlerReport['series'][number]

export function CrawlerList({ series, off, onToggle, empty }: { series: Series[]; off: Set<string>; onToggle: (name: string) => void; empty: string }) {
  return (
    <ul className="crawl-list">
      {series.map((s) => (
        <li key={s.name}>
          <button type="button" aria-pressed={!off.has(s.name)} onClick={() => onToggle(s.name)}>
            <span className="dot" style={{ background: off.has(s.name) ? 'var(--text-3)' : colorOf(s.name) }} aria-hidden="true" />
            <span className="crawl-name">{s.name}</span>
            <span className="num">{fmtInt(s.total)}</span>
          </button>
        </li>
      ))}
      {series.length === 0 && <li className="faint crawl-none">{empty}</li>}
    </ul>
  )
}
