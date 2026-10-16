// What Explore reads: the report for the period with the panel's filters (and the one before it, when comparing), and the
// usual of each row of a table. The last answer stays on screen while the next is read.
import { useEffect, useState } from 'react'
import { api, type Filter, type Result, type Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { usualBand } from '../briefing/useSlices'
import type { Band } from '../briefing/usual'
import { sameFilter } from '../../lib/filterSet'
import type { Row } from './model'

export interface Answer {
  cur: Result
  prev?: Result
  bucket: string
}

const norm = (r: Result | undefined): Result | undefined => (r ? { ...r, series: r.series ?? [] } : undefined)

export function useReport(site: Site, range: Range, filters: Filter[], comparing: boolean, on: boolean): { answer: Answer | null; loading: boolean } {
  const [got, setGot] = useState<{ key: string; a: Answer } | null>(null)
  const key = `${site.id}|${range.from}|${range.to}|${filters.map((f) => `${f.dim}${f.op ?? '='}${f.value}`).join('&')}|${comparing}`
  useEffect(() => {
    if (!on) return
    let live = true
    void api.report(site.id, { from: range.from, to: range.to, filters, compare: comparing ? 'previous' : undefined, deep: true }).then(
      (r) => live && setGot({ key, a: { cur: norm(r.current) as Result, prev: norm(r.previous), bucket: r.bucket } }),
      () => undefined,
    )
    return () => {
      live = false
    }
    // The filters are keyed by content.
  }, [key, on, site.id, range.from, range.to, comparing]) // eslint-disable-line react-hooks/exhaustive-deps
  return { answer: got?.a ?? null, loading: !got || got.key !== key }
}

/** Each row's own usual for a day (today or yesterday); empty for a longer period, which is told against the one before. */
export function useBands(site: Site, day: string, enabled: boolean, filters: Filter[], dim: string, values: string[]): Map<string, Band | null> {
  const [got, setGot] = useState<{ key: string; m: Map<string, Band | null> } | null>(null)
  const key = `${site.id}|${day}|${dim}|${values.join(',')}|${filters.map((f) => f.dim + f.value).join('&')}`
  useEffect(() => {
    if (!enabled || !values.length) return
    let live = true
    void Promise.all(values.map((v) => usualBand(site.id, day, [...filters.filter((f) => !sameFilter(f, { dim, value: v }) && f.dim !== dim), { dim, value: v }]))).then((bands) => live && setGot({ key, m: new Map(values.map((v, i) => [v, bands[i]])) }))
    return () => {
      live = false
    }
    // The filters are keyed by content.
  }, [key, enabled, site.id, day, dim, values]) // eslint-disable-line react-hooks/exhaustive-deps
  return got && got.key === key ? got.m : new Map<string, Band | null>()
}

/** The rows of a table: the report's rows with the people of each, its usual and (when comparing) the period before. */
export function rowsFor(cur: Result, prev: Result | undefined, dim: string, name: (v: string) => string, bands: Map<string, Band | null>): Row[] {
  const before = new Map((prev?.dims[dim] ?? []).map((r) => [r.value, r.visitors]))
  return (cur.dims[dim] ?? [])
    .filter((r) => r.value !== '')
    .map((r) => ({ value: r.value, name: name(r.value), v: r.visitors, band: bands.get(r.value) ?? null, p: prev ? (before.get(r.value) ?? 0) : undefined }))
}
