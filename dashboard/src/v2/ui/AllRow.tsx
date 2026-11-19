// "All sites" at the top of the site list, with the visitors of today over the sites listed (the row is only its name until the numbers are here).
import { LayoutGrid } from 'lucide-react'
import { fmtCompact } from '../../lib/format'
import { copy as menu } from '../../features/sites/menuCopy'
import { copy as statusCopy } from '../../features/sitestatus/copy'

/** The sites that are down or not installed, said under the name, the worst first: a failing site shows here too, whatever the total says. */
function Problems({ c }: { c: { down: number; unverified: number } }) {
  const parts = [c.down > 0 && ['down', menu.downCount(c.down)], c.unverified > 0 && ['quiet', menu.notInstalledCount(c.unverified)]].filter(Boolean) as string[][]
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

/** onWhy: "1 down" opens what happened (the menu's status list); it lies over the row's own line, as its own button. */
export function AllRow({ on, total, all, problems, onPick, onWhy }: { on: boolean; total: number | null; all: string; problems?: { down: number; unverified: number }; onPick: () => void; onWhy?: () => void }) {
  const row = (
    <button type="button" data-stop className={`mi all${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} onClick={onPick}>
      <LayoutGrid size={14} strokeWidth={1.75} aria-hidden="true" />
      <span className="mt2">
        <div className="nm">{all}</div>
        {problems && <Problems c={problems} />}
      </span>
      {total !== null && total > 0 && (
        <span className="now" title={menu.todayAll}>
          <b>{fmtCompact(total)}</b>
        </span>
      )}
    </button>
  )
  if (!onWhy || !problems?.down) return row
  return (
    <div className="all-wrap">
      {row}
      <button type="button" data-stop data-site-why="1" className="all-why" aria-label={statusCopy.whatHappened(problems.down)} onClick={onWhy}>
        {menu.downCount(problems.down)} ›
      </button>
    </div>
  )
}
