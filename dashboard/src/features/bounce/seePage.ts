// "See this page" and "See speed details": Explore, on one page.
import { navigate } from '../../lib/url'
import { openThing } from '../../v2/explore/thing'
import type { Tab } from '../../v2/explore/types'

function toExplore(domain: string, page: string, tab?: Tab) {
  const home = '/' + encodeURIComponent(domain)
  if (location.pathname !== home) navigate(home)
  openThing({ kind: 'page', value: page }, { tab })
}

export const seePage = (domain: string, page: string) => toExplore(domain, page)

/** The speed tab. */
export const seeSpeed = (domain: string, page: string) => toExplore(domain, page, 'speed')
