// Pages → Scroll: how far down each page people read, for the dashboard's
// period and filters. A page nobody reads past the fold says more than its
// view count does.
import { useEffect, useState } from 'react'
import { api, type ReportQuery, type ScrollReport, type Site } from '../lib/api'
import { BarList } from '../charts/BarList'
import { fmtInt, fmtPct } from '../lib/format'

export function ScrollDepth({ site, query, rows }: { site: Site; query: ReportQuery; rows: number }) {
  const [rep, setRep] = useState<ScrollReport | null>(null)
  const [err, setErr] = useState('')
  const key = JSON.stringify([site.id, query.from, query.to, query.filters])
  useEffect(() => {
    const ac = new AbortController()
    setErr('')
    api
      .scroll(site.id, query, ac.signal)
      .then(setRep)
      .catch((e: Error) => !ac.signal.aborted && setErr(e.message))
    return () => ac.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="empty">{err}</div>
  const pages = rep?.pages ?? []
  return (
    <>
      <BarList
        dimLabel="Page"
        valueLabel="Depth"
        fmtValue={(n) => n + '%'}
        subLabel="Read ¾"
        loading={!rep}
        emptyText="No page view has reported how far it scrolled yet."
        pickLabel={(k) => {
          const r = pages.find((x) => x.path === k)
          return r ? `${k}: read ${Math.round(r.avg)}% of the way down on average, over ${fmtInt(r.pageviews)} views` : k
        }}
        items={pages.slice(0, rows).map((r) => ({
          key: r.path,
          label: r.path,
          title: `${fmtInt(r.pageviews)} views · ${fmtPct(r.read)} got at least three quarters down`,
          value: Math.round(r.avg),
          sub: r.read,
        }))}
      />
      {rep && rep.samples > 0 && (
        <p className="faint" style={{ margin: '10px 0 0', fontSize: 12 }}>
          Across {fmtInt(rep.samples)} page views, people read {Math.round(rep.avg)}% of the way down on average; {fmtPct(rep.reached[1])} got
          halfway and {fmtPct(rep.reached[3])} reached the end.
        </p>
      )}
    </>
  )
}
