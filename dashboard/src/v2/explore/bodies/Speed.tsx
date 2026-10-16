// Speed: how fast pages feel to the people who visit, at the 75th percentile (Web Vitals), and the slowest pages.
import { useEffect, useState } from 'react'
import type { Site, WebVitals } from '../../../lib/api'
import { more } from '../../../lib/apiMore'
import { addDays, type Range } from '../../../lib/dates'
import { copy } from '../copy'
import { XCols, XEmpty, XKc, XNote, XSec, type ColRow } from '../ui'

type Grade = 'good' | 'mid' | 'poor'
const grade = (i: number, v: number): Grade => {
  const t = [[2500, 4000], [200, 500], [100, 250]][i]
  if (v <= t[0]) return 'good'
  return v <= t[1] ? 'mid' : 'poor'
}
function show(i: number, v: number): string {
  if (i === 0) return `${(v / 1000).toFixed(1)} s`
  return i === 1 ? `${Math.round(v)} ms` : (v / 1000).toFixed(2)
}

export function Speed({ site, range, limit, onAll }: { site: Site; range: Range; limit: number; onAll: () => void }) {
  const [v, setV] = useState<WebVitals | null | undefined>(undefined)
  const [was, setWas] = useState<WebVitals | null>(null)
  useEffect(() => {
    let live = true
    void more.vitals(site.id, { from: range.from, to: range.to }).then((r) => live && setV(r), () => live && setV(null))
    void more.vitals(site.id, { from: addDays(range.from, -28), to: addDays(range.from, -1) }).then((r) => live && setWas(r), () => live && setWas(null))
    return () => {
      live = false
    }
  }, [site.id, range.from, range.to])
  if (v === undefined) return null
  if (!v || v.samples === 0) return <XEmpty title={copy.speedNone} sub={copy.speedNoneSub} />
  const vals = [v.lcp_ms ?? 0, v.inp_ms ?? 0, v.cls_1k ?? 0]
  const usual = was && was.samples >= 5 ? [was.lcp_ms ?? 0, was.inp_ms ?? 0, was.cls_1k ?? 0] : null
  const icons = ['speed', 'click', 'goal'] as const
  const pages: ColRow[] = (v.pages ?? []).map((p) => ({ key: p.value, a: p.value, bar: p.visitors / Math.max(1, ...(v.pages ?? []).map((x) => x.visitors)), mono: true, c: [show(0, p.visitors), <><i className={`vg ${grade(0, p.visitors)}`} />{copy.grades[grade(0, p.visitors)]}</>] }))
  return (
    <>
      <div className="kcs xk k3">
        {vals.map((x, i) => (
          <XKc key={copy.vitalLabels[i]} icon={icons[i]} label={copy.vitalLabels[i]} value={show(i, x)} note={copy.vitalAbbr[i]} tone={grade(i, x) === 'good' ? '' : 'dn'} line={usual ? `${copy.usualWord} ${show(i, usual[i])} · ${copy.grades[grade(i, x)]}` : copy.grades[grade(i, x)]} />
        ))}
      </div>
      <XSec l={copy.slowest} r={copy.byLcp} />
      <XCols first={copy.page} cols={[{ h: copy.lcp }, { h: copy.rating }]} rows={pages} xc="minmax(0,1fr) 64px 112px" xcm="minmax(0,1fr) 52px 104px" limit={limit} showAll={copy.showAll} onAll={onAll} />
      <XNote>{copy.speedNote}</XNote>
    </>
  )
}
