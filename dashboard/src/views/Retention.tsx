// Of the people who first came in a week, how many came back. The one number
// that says whether a site is building an audience or renting one.
import { useEffect, useState } from 'react'
import { api, type Cohorts, type ReportQuery, type Site } from '../lib/api'
import { Info } from '../components/Info'
import { fmtInt } from '../lib/format'

const weekLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function Retention({ site, query }: { site: Site; query: ReportQuery }) {
  const [data, setData] = useState<Cohorts | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let live = true
    api
      .retention(site.id, query)
      .then((d) => live && setData(d))
      .catch(() => live && setErr(true))
    return () => {
      live = false
    }
  }, [site.id, query])

  const widest = Math.max(1, ...(data?.back ?? []).map((r) => r.length))

  return (
    <div className="card">
      <div className="card-head">
        <h2>Retention</h2>
        <Info text="Each row is the week a group of people first arrived; each column is a week after that. The figure is the share of that group who came back. Someone's week is when trckable first saw them, not when this report starts — so a visitor of two years' standing is never counted as new." />
        {data && data.weeks.length > 0 && (
          <span className="faint card-note" style={{ fontSize: 12, marginLeft: 'auto' }}>
            By the week they arrived
          </span>
        )}
      </div>

      {err ? (
        <span className="faint">Couldn't read retention.</span>
      ) : !data ? (
        <div className="skeleton" style={{ height: 140 }} />
      ) : data.weeks.length === 0 ? (
        <span className="faint">Not enough history in this period yet. Pick a longer one — retention needs at least two whole weeks.</span>
      ) : (
        <div className="cohorts" style={{ ['--cols' as string]: widest }}>
          <span className="faint cohort-head">Arrived</span>
          {Array.from({ length: widest }, (_, k) => (
            <span key={k} className="faint cohort-head num">
              {k === 0 ? 'that week' : '+' + k}
            </span>
          ))}
          {data.weeks.map((w, i) => {
            const row = data.back[i]
            const size = data.size[i] || 1
            return (
              <div key={w} className="cohort-row" style={{ display: 'contents' }}>
                <span className="cohort-week">
                  {weekLabel(w)}
                  <b className="num faint">{fmtInt(data.size[i])}</b>
                </span>
                {Array.from({ length: widest }, (_, k) => {
                  if (k >= row.length) return <span key={k} className="cohort-cell empty" />
                  // A share can only run from none of them to all of them.
                  // Clamping is not cosmetic: a server bug once sent 102 of 0,
                  // and an unclamped colour-mix of 7956% is an invisible cell.
                  const share = Math.max(0, Math.min(1, row[k] / size))
                  // How much accent is actually behind the text, which is what
                  // decides whether light or dark ink can be read on it.
                  const fill = Math.round(share * 78)
                  return (
                    <span
                      key={k}
                      className={fill >= 60 ? 'cohort-cell num solid' : 'cohort-cell num'}
                      title={`${fmtInt(row[k])} of ${fmtInt(data.size[i])} came back`}
                      style={{ background: `color-mix(in srgb, var(--accent) ${fill}%, transparent)` }}
                    >
                      {Math.round(share * 100)}%
                    </span>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
