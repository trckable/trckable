// "See this page": Data on the site, filtered to one page.
import { navigate, setView } from '../../lib/url'

export function seePage(domain: string, page: string) {
  const home = '/' + encodeURIComponent(domain)
  if (location.pathname !== home) navigate(home)
  setView({ v: 'explore', live: false, filters: [{ dim: 'page', value: page }] })
}
