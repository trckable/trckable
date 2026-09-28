// Site access for People: the account's sites, and which of them each
// viewer may see. Loaded again whenever People's lists change (someone added,
// removed, made an owner); a save is one Save in the popup, and the server's
// list replaces this one.
import { useCallback, useEffect, useState } from 'react'
import { api, type SiteAccessList } from '../../lib/api'

export type SiteAccess = ReturnType<typeof useSiteAccess>

export function useSiteAccess(people: unknown) {
  const [list, setList] = useState<SiteAccessList | null>(null)
  /** Rejects with the server's refusal, for the popup to show. */
  const save = useCallback((id: string, sites: string[] | null) => api.setSiteAccess(id, sites).then(setList), [])
  const reload = useCallback(() => {
    api.siteAccess().then(setList).catch(() => {})
  }, [])
  useEffect(() => {
    if (people) reload()
  }, [people, reload])
  const sites = list?.sites ?? []
  // One site: nothing to choose between, so People shows nothing about it.
  const shown = sites.length > 1
  const of = (id: string) => list?.viewers.find((v) => v.id === id)
  return { sites, shown, of, save, reload }
}
