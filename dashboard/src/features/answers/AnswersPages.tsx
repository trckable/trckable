// Pages AI links to: the pages the assistants linked, set against what AI crawlers read, what AI assistants sent and what that earned.
import { fmtInt } from '../../lib/format'
import { answersCopy as c } from './copy'
import type { PageRow } from './api'
import { hasEarned, hasTraffic } from './derive'

export function AnswersPages({ rows, money, onPick }: { rows: PageRow[]; money: (minor: number) => string; onPick: (path: string) => void }) {
  if (rows.length === 0) return null
  const earn = hasEarned(rows)
  const traffic = hasTraffic(rows)
  const total = rows.reduce((p, r) => p + (r.revenue ?? 0), 0)
  const paid = rows.filter((r) => (r.revenue ?? 0) > 0).length
  const read = Math.max(1, ...rows.map((r) => r.read ?? 0))
  const best = Math.max(...rows.map((r) => r.revenue ?? 0))
  const cols = `an-pt${traffic ? '' : ' no-traffic'}${earn ? '' : ' no-earn'}`
  return (
    <section className="an-pages" aria-label={c.pagesHead}>
      <div className="an-ph">
        <h2>{c.pagesHead}</h2>
        {total > 0 && <p>{c.pagesTotal(money(total), paid)}</p>}
      </div>
      <div className={cols}>
        <div className="an-pr head">
          <span>{c.page.path}</span>
          <span className="hm a" title={c.pageHints.answers}>{c.page.answers}</span>
          {traffic && <span className="hm" title={c.pageHints.read}>{c.page.read}</span>}
          {traffic && <span title={c.pageHints.sent}>{c.page.sent}</span>}
          {earn && <span className="earn" title={c.pageHints.earned}>{c.page.earned}</span>}
        </div>
        {rows.map((r) => {
          const made = r.revenue ?? 0
          return (
            <button key={r.path} type="button" className={`an-pr${made > 0 && made === best ? ' top' : ''}`} onClick={() => onPick(r.path)}>
              <span className="path">
                <i style={{ width: `${((r.read ?? 0) / read) * 100}%` }} />
                <span>{r.path}</span>
              </span>
              <span className="n hm a">{fmtInt(r.answers)}</span>
              {traffic && <span className="n hm">{fmtInt(r.read ?? 0)}</span>}
              {traffic && <span className="n">{fmtInt(r.sent ?? 0)}</span>}
              {earn && <span className={`earn${made > 0 ? '' : ' zero'}`}>{made > 0 ? money(made) : '–'}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}
