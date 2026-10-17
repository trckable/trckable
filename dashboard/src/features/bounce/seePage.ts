// "See this page" and "See speed details": Explore, on one page.
import { navigate, setView } from '../../lib/url'

function toExplore(domain: string, page: string, tab: 'pages' | 'speed') {
  const home = '/' + encodeURIComponent(domain)
  if (location.pathname !== home) navigate(home)
  setView({ live: false, xp: tab, xf: [{ dim: 'page', value: page }] })
}

export const seePage = (domain: string, page: string) => toExplore(domain, page, 'pages')

/** The speed tab. */
export const seeSpeed = (domain: string, page: string) => toExplore(domain, page, 'speed')
