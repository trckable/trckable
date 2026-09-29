// Where an address that names none of the person's sites goes, keeping the
// rest of its query: the site a link asked for (?site=<id>), else siteRoute's answer (the first site, or with
// no site the first run).
import type { Site } from './api'
import { redirectFor } from './siteRoute'

export function landing(
  sites: Site[], params: URLSearchParams,
): { path: string; wizard: boolean } {
  const rest = new URLSearchParams(params)
  const asked = sites.find((s) => s.id === rest.get('site'))
  rest.delete('site')
  const q = rest.toString()
  const search = q ? '?' + q : ''
  if (asked) return { path: '/' + encodeURIComponent(asked.domain) + search, wizard: false }
  const to = redirectFor(sites)
  return { path: to.path + search, wizard: to.wizard }
}
