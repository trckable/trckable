// A period's links, loaded when the page asks, and the sites' icons a moment later. A failed read leaves the page saying so, never an error screen.
import { useEffect, useState } from 'react'
import { fetchRowExtras } from '../cards/rowExtras'
import { linksApi, type LinksAnswer } from './api'

type State = { key: string; data: LinksAnswer | null; failed: boolean }

export function useLinks(site: string, from: string, to: string, enabled = true, withIcons = true) {
  const key = `${site}:${from}:${to}`
  const [state, setState] = useState<State>({ key: '', data: null, failed: false })
  const [icons, setIcons] = useState<{ key: string; set: Set<string> } | null>(null)
  useEffect(() => {
    if (!enabled) return
    const ctl = new AbortController()
    linksApi.read(site, from, to, ctl.signal).then(
      (data) => setState({ key, data, failed: false }),
      () => !ctl.signal.aborted && setState({ key, data: null, failed: true }),
    )
    return () => ctl.abort()
  }, [key, enabled]) // eslint-disable-line react-hooks/exhaustive-deps -- the key says what is read
  const data = state.key === key ? state.data : null
  useEffect(() => {
    if (!withIcons) return
    const hosts = (data?.links ?? []).filter((l) => l.dim === 'referrer' && l.value.includes('.')).map((l) => l.value)
    if (!hosts.length) return
    let live = true
    fetchRowExtras({ site, tz: 'UTC', dim: 'referrer', keys: hosts, filters: [], spark: false, icons: true })
      .then((x) => live && x.icons && setIcons({ key, set: x.icons }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps -- the icons follow the rows
  return { data, ready: state.key === key, failed: state.key === key && state.failed, icons: icons?.key === key ? icons.set : new Set<string>() }
}
