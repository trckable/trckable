// Site access for People: the account's sites, and which of them each
// viewer may see. Loaded again whenever People's
// lists change (someone added, removed, made an owner); a change is saved
// at once and the server's list replaces this one.
import { useCallback, useEffect, useState } from 'react'
import { api, type SiteAccessList } from '../../lib/api'
import { toast } from '../../components/Toast'

export type SiteAccess = ReturnType<typeof useSiteAccess>

export function useSiteAccess(people: unknown) {
  const [list, setList] = useState<SiteAccessList | null>(null)
  const save = useCallback((id: string, sites: string[] | null) => {
    api.setSiteAccess(id, sites).then(setList).catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error'))
  }, [])
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
