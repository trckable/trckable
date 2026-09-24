// How fast the site feels, measured by the browsers that actually visited it.
// Reported at the 75th percentile, which is how Google scores a page: the
// experience three quarters of visits were at least as good as, not the
// average nobody had.
import { useEffect, useState } from 'react'
import { api, type ReportQuery, type Site, type WebVitals } from '../lib/api'
import { Info } from '../components/Info'
import { fmtInt } from '../lib/format'

// The boundaries Google publishes. Between the two a score needs work; above
// the second it is poor.
const SCORES = [
  { key: 'lcp_ms', label: 'Loads', hint: 'Largest contentful paint: when the main thing finished drawing', good: 2500, poor: 4000, show: (v: number) => (v / 1000).toFixed(2) + 's' },
  { key: 'cls_1k', label: 'Holds still', hint: 'Cumulative layout shift: how much the page moves under you while it loads', good: 100, poor: 250, show: (v: number) => (v / 1000).toFixed(3) },
  { key: 'inp_ms', label: 'Responds', hint: 'The slowest interaction: how long a click or tap waited to be answered', good: 200, poor: 500, show: (v: number) => fmtInt(v) + 'ms' },
] as const

const toneOf = (v: number, good: number, poor: number) => (v <= good ? 'var(--up)' : v <= poor ? 'var(--money)' : 'var(--down)')

export function Vitals({ site, query }: { site: Site; query: ReportQuery }) {
  const [data, setData] = useState<WebVitals | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let live = true
    api
      .vitals(site.id, query)
      .then((d) => live && setData(d))
      .catch(() => live && setErr(true))
    return () => {
      live = false
    }
  }, [site.id, query])

  return (
    <div className="card">
      <div className="card-head">
        <h2>Web Vitals</h2>
        <Info text="The three scores Google measures a page by, taken from the browsers that visited yours — not from a test machine on a fast connection. Each one is the 75th percentile: three quarters of your visits were at least this good." />
        {data && data.samples > 0 && (
          <span className="faint card-note" style={{ fontSize: 12, marginLeft: 'auto' }}>
            {fmtInt(data.samples)} measured {data.samples === 1 ? 'view' : 'views'}
          </span>
        )}
      </div>

      {err ? (
        <span className="faint">Couldn't read the speed scores.</span>
      ) : !data ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : data.samples === 0 ? (
        <span className="faint">
          Nothing measured yet in this period. Browsers report these when a page is hidden, so the first numbers appear once people have been and gone.
        </span>
      ) : (
        <>
          <div className="vitals">
            {SCORES.map((s) => {
              const v = data[s.key]
              return (
                <div key={s.key} className="vital" title={s.hint}>
                  <span className="faint">{s.label}</span>
                  {v == null ? (
                    <b className="num faint">—</b>
                  ) : (
                    <b className="num" style={{ color: toneOf(v, s.good, s.poor) }}>
                      {s.show(v)}
                    </b>
                  )}
                  <i style={{ background: v == null ? 'var(--grid)' : toneOf(v, s.good, s.poor) }} />
                </div>
              )
            })}
          </div>
          {(data.pages?.length ?? 0) > 0 && (
            <>
              <span className="faint" style={{ fontSize: 12 }}>
                Slowest to load — fix from the top
              </span>
              <ul className="vital-pages">
                {data.pages!.map((p) => (
                  <li key={p.value}>
                    <span className="num" title={p.value}>
                      {p.value}
                    </span>
                    <span className="faint num">{fmtInt(p.pageviews ?? 0)} views</span>
                    <b className="num" style={{ color: toneOf(p.visitors, 2500, 4000) }}>
                      {(p.visitors / 1000).toFixed(2)}s
                    </b>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
