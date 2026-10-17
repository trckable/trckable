// "See this page" and "See speed details": the site's Data, filtered to one page.
import { navigate, setView } from '../../lib/url'

function toData(domain: string, page: string, patch: Parameters<typeof setView>[0]) {
  const home = '/' + encodeURIComponent(domain)
  if (location.pathname !== home) navigate(home)
  setView({ live: false, filters: [{ dim: 'page', value: page }], ...patch })
}

export const seePage = (domain: string, page: string) => toData(domain, page, { v: 'explore' })

/** Full mode, where the speed tab is. */
export const seeSpeed = (domain: string, page: string) => toData(domain, page, { mode: 'full' })
