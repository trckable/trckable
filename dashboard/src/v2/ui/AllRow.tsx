// "All sites" at the top of the site list, with the visitors of today over the sites listed (the row is only its name until the numbers are here).
import { LayoutGrid } from 'lucide-react'
import { fmtCompact } from '../../lib/format'
import { copy as menu } from '../../features/sites/menuCopy'

/** The sites that are down or not verified, said under the name, the worst first: a failing site shows here too, whatever the total says. */
function Problems({ c }: { c: { down: number; unverified: number } }) {
  const parts = [c.down > 0 && ['down', menu.downCount(c.down)], c.unverified > 0 && ['quiet', menu.unverifiedCount(c.unverified)]].filter(Boolean) as string[][]
  if (parts.length === 0) return null
  return (
    <div className="d state-line all-problems">
      {parts.map(([k, w], i) => (
        <span key={w} className={k === 'down' ? 'down' : undefined}>
          {i > 0 && ' · '}
          {w}
        </span>
      ))}
    </div>
  )
}

export function AllRow({ on, total, all, problems, onPick }: { on: boolean; total: number | null; all: string; problems?: { down: number; unverified: number }; onPick: () => void }) {
  return (
    <button type="button" data-stop className={`mi all${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} onClick={onPick}>
      <LayoutGrid size={14} strokeWidth={1.75} aria-hidden="true" />
      <span className="mt2">
        <div className="nm">{all}</div>
        {problems && <Problems c={problems} />}
      </span>
      {total !== null && (
        <span className="now" title={menu.todayAll}>
          <b>{fmtCompact(total)}</b>
        </span>
      )}
    </button>
  )
}
