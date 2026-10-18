// Pages AI links to: the pages the assistants linked, set against what AI crawlers read, what AI assistants sent and what that earned.
import { fmtInt } from '../../lib/format'
import { answersCopy as c } from './copy'
import type { PageRow } from './api'

export function AnswersPages({ rows, money, onPick }: { rows: PageRow[]; money: (minor: number) => string; onPick: (path: string) => void }) {
  if (rows.length === 0) return null
  const total = rows.reduce((p, r) => p + r.earned, 0)
  const read = Math.max(1, ...rows.map((r) => r.read))
  const best = Math.max(...rows.map((r) => r.earned))
  return (
    <section className="an-pages" aria-label={c.pagesHead}>
      <div className="an-ph">
        <h3>{c.pagesHead}</h3>
        <p>{total > 0 && c.pagesTotal(money(total), rows.filter((r) => r.earned > 0).length)}</p>
      </div>
      <div className="an-pt">
        <div className="an-pr head">
          <span>{c.page.path}</span>
          <span className="hm a" title={c.pageHints.answers}>{c.page.answers}</span>
          <span className="hm" title={c.pageHints.read}>{c.page.read}</span>
          <span title={c.pageHints.sent}>{c.page.sent}</span>
          <span className="earn" title={c.pageHints.earned}>{c.page.earned}</span>
        </div>
        {rows.map((r) => (
          <button key={r.path} type="button" className={`an-pr${r.earned > 0 && r.earned === best ? ' top' : ''}`} onClick={() => onPick(r.path)}>
            <span className="path">
              <i style={{ width: `${(r.read / read) * 100}%` }} />
              <span>{r.path}</span>
            </span>
            <span className="n hm a">{fmtInt(r.answers)}</span>
            <span className="n hm">{fmtInt(r.read)}</span>
            <span className="n">{fmtInt(r.sent)}</span>
            <span className={`earn${r.earned > 0 ? '' : ' zero'}`}>{r.earned > 0 ? money(r.earned) : '–'}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
