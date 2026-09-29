// Site access for People: the account's sites, and which of them each
// viewer may see. Loaded again whenever People's lists change (someone added,
// removed, made an owner); a save is one Save in the popup, and the server's
// list replaces this one.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Site, type SiteAccessList } from '../../lib/api'

export type SiteAccess = ReturnType<typeof useSiteAccess>
/** A site as People draws it: its names and, when the owner set one, its look. */
export type AccessSite = SiteAccessList['sites'][number] & Partial<Pick<Site, 'color' | 'icon_url'>>

export function useSiteAccess(people: unknown) {
  const [list, setList] = useState<SiteAccessList | null>(null)
  // The access list names the sites; their icons and colours come from the sites themselves.
  const [looks, setLooks] = useState<Map<string, Pick<Site, 'color' | 'icon_url'>>>(new Map())
  /** Rejects with the server's refusal, for the popup to show. */
  const save = useCallback((id: string, sites: string[] | null) => api.setSiteAccess(id, sites).then(setList), [])
  const reload = useCallback(() => {
    api.siteAccess().then(setList).catch(() => {})
    api
      .sites()
      .then((r) => setLooks(new Map(r.sites.map((s) => [s.id, { color: s.color, icon_url: s.icon_url }]))))
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (people) reload()
  }, [people, reload])
  const sites: AccessSite[] = useMemo(() => (list?.sites ?? []).map((s) => ({ ...s, ...looks.get(s.id) })), [list, looks])
  // One site: nothing to choose between, so People shows nothing about it.
  const shown = sites.length > 1
  const of = (id: string) => list?.viewers.find((v) => v.id === id)
  return { sites, shown, of, save, reload }
}
