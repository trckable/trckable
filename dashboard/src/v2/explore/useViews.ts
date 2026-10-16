// The saved views of a site (filters under a name): read once, saved and deleted here. A view is its filters in the
// address's own words, so one saved from the older screens still applies its filters.
import { useCallback, useEffect, useState } from 'react'
import { api, type Filter, type Segment, type Site } from '../../lib/api'
import { more } from '../../lib/apiMore'
import { filterParam, parseFilterParam } from '../../lib/filterSet'
import { isShared, isViewer } from '../../lib/me'

export const queryOfFilters = (fs: Filter[]): string => fs.map((f) => `f=${encodeURIComponent(filterParam(f))}`).join('&')
export const filtersOfQuery = (q: string): Filter[] => new URLSearchParams(q.replace(/^\?/, '')).getAll('f').flatMap((f) => parseFilterParam(f) ?? [])

export function useViews(site: Site) {
  const [list, setList] = useState<Segment[]>([])
  const can = !isShared()
  const load = useCallback(() => {
    if (can) void api.segments(site.id).then((r) => setList(r.segments ?? []), () => setList([]))
  }, [site.id, can])
  useEffect(load, [load])
  return {
    list,
    save: (name: string, fs: Filter[]) => (isViewer() ? Promise.resolve() : more.saveSegment(site.id, name, queryOfFilters(fs)).then(load)),
    remove: (id: string) => api.deleteSegment(site.id, id).then(load),
  }
}
