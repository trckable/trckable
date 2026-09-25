// Sources → Search: what people searched on Google before they came, from
// the site's own Search Console, for the dashboard's period. Google's rows are
// searches, not visits, so they cannot filter the page; each row says what it
// is instead.
import { useEffect, useState } from 'react'
import { api, type ReportQuery, type SearchReport, type Site } from '../lib/api'
import { BarList } from '../charts/BarList'
import { fmtInt, fmtPct } from '../lib/format'
import { openSettings } from '../lib/settings'

export function SearchTerms({ site, query, rows, full }: { site: Site; query: ReportQuery; rows: number; full: boolean }) {
  const [rep, setRep] = useState<SearchReport | null>(null)
  const [err, setErr] = useState<{ code: 'off' | 'other'; msg: string } | null>(null)
  const key = JSON.stringify([site.id, query.from, query.to, query.filters])

  useEffect(() => {
    const ac = new AbortController()
    setErr(null)
    api
      .searchReport(site.id, query, 'query', ac.signal)
      .then(setRep)
      .catch((e: Error & { status?: number }) => {
        if (ac.signal.aborted) return
        setRep(null)
        setErr(/not connected/i.test(e.message) ? { code: 'off', msg: e.message } : { code: 'other', msg: e.message })
      })
    return () => ac.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (err?.code === 'off')
    return (
      <div className="empty" style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <span>Connect Google Search Console to see the searches that showed this site.</span>
        <button type="button" className="btn" onClick={() => openSettings(site, 'search')}>
          Connect Search Console
        </button>
      </div>
    )
  if (err) return <div className="empty">Google said: {err.msg}</div>

  const list = rep?.rows ?? []
  const ignored = rep?.ignored_filters?.length ? rep.ignored_filters : null
  return (
    <>
      <BarList
        dimLabel="Search"
        valueLabel="Clicks"
        subLabel={full ? 'CTR' : undefined}
        loading={!rep}
        emptyText="No searches showed this site in this period."
        pickLabel={(k) => {
          const r = list.find((x) => x.key === k)
          return r ? `${k}: ${fmtInt(r.clicks)} clicks from ${fmtInt(r.impressions)} impressions, average position ${r.position.toFixed(1)}` : k
        }}
        items={list.slice(0, rows).map((r) => ({
          key: r.key,
          label: r.key,
          title: `${fmtInt(r.impressions)} impressions · average position ${r.position.toFixed(1)}`,
          value: r.clicks,
          sub: r.ctr,
        }))}
      />
      {rep && (
        <p className="faint" style={{ margin: '10px 0 0', fontSize: 12 }}>
          From Google Search Console · {fmtInt(rep.impressions)} impressions, {fmtPct(rep.impressions ? rep.clicks / rep.impressions : 0)} clicked. Google's last three days may still change.
          {ignored && ` Google can't apply the ${ignored.join(', ')} filter, so it's left out here.`}
        </p>
      )}
    </>
  )
}
