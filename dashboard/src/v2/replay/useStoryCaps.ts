// The moments of a period that is not today, read from the report's moments route (aggregates only) and told in the
// replay's words. Read as soon as the chart is on the page, so the run never waits for them at the click. A shared link has none.
import { useEffect, useMemo, useState } from 'react'
import { call, reportURL, type Bucket, type ReportQuery } from '../../lib/api'
import { isShared } from '../../lib/me'
import { place, type Moment } from '../../features/story/moments'
import { wordsOf } from '../../features/story/words'
import { bucketLabel } from '../../charts/timeScale'
import type { Cap, CapKind } from './story'

const KIND: Partial<Record<Moment['kind'], CapKind>> = { spike: 'jump', surge: 'jump', mention: 'mention', sale: 'sale' }

export function useStoryCaps(o: { on: boolean; site: string; query: ReportQuery; bucket: Bucket; labels: string[]; money?: (minor: number) => string }): { caps: Cap[]; loaded: boolean } {
  const url = reportURL(o.site, { ...o.query, compare: undefined, daily: false, deep: false, bucket: o.bucket }).replace('/report?', '/moments?')
  const [got, setGot] = useState<{ url: string; list: Moment[] }>({ url: '', list: [] })
  const off = !o.on || isShared()
  useEffect(() => {
    if (off) return
    const ctl = new AbortController()
    const done = (list: Moment[]) => !ctl.signal.aborted && setGot({ url, list })
    call<{ moments: Moment[] }>('GET', url, undefined, ctl.signal, true)
      .then((r) => done(r.moments ?? []))
      .catch(() => done([]))
    return () => ctl.abort()
  }, [url, off])
  const key = o.labels.join(',')
  const hasMoney = !!o.money
  const money = o.money
  const bucket = o.bucket
  const caps = useMemo(() => {
    const labels = key.split(',')
    const n = labels.length
    return place(got.list, labels, hasMoney).flatMap((x): Cap[] => {
      const m = x.moments.find((k) => KIND[k.kind])
      const kind = m && KIND[m.kind]
      if (!m || !kind || n < 2) return []
      const w = wordsOf(m, money)
      return [{ pos: x.i / (n - 1), at: bucket === 'hour' ? labels[x.i].slice(11, 16) : bucketLabel(labels[x.i], bucket), line: w.line, sub: w.sub, kind }]
    })
  }, [got.list, key, hasMoney, money, bucket])
  return { caps, loaded: off || got.url === url }
}
