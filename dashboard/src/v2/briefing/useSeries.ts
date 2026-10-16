// The visitors of one slice of the period (the people who reached a goal, who came from a country) bucket by bucket,
// for a card's line. Read once per slice, and the last one stays while the next is read, so nothing blinks.
import { useEffect, useState } from 'react'
import { api, type Bucket, type Filter, type Site } from '../../lib/api'
import type { Range } from '../../lib/dates'

const cache = new Map<string, Promise<number[]>>()

function read(site: string, range: Range, bucket: Bucket, f: Filter): Promise<number[]> {
  const key = `${site}|${range.from}|${range.to}|${bucket}|${f.dim}|${f.value}`
  let p = cache.get(key)
  if (!p) {
    p = api.report(site, { from: range.from, to: range.to, bucket, filters: [f] }).then((r) => (r.current.series ?? []).map((x) => x.visitors))
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

export function useSlice(site: Site, range: Range, bucket: Bucket | undefined, f: Filter | null): number[] {
  const [got, setGot] = useState<number[]>([])
  const dim = f?.dim
  const value = f?.value
  const { from, to } = range
  useEffect(() => {
    if (!bucket || !dim || value === undefined) return
    let live = true
    read(site.id, { from, to }, bucket, { dim, value }).then(
      (v) => live && setGot(v),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [site.id, from, to, bucket, dim, value])
  return dim ? got : []
}
