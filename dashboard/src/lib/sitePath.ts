// The address of one of a site's own pages (/{domain}/incidents, /{domain}/links).

/** `keep` carries the period the dashboard shows over to the page. */
export function sitePagePath(domain: string, suffix: string, keep = false): string {
  const q = new URLSearchParams()
  if (keep) {
    const here = new URLSearchParams(location.search)
    for (const k of ['period', 'from', 'to']) if (here.get(k)) q.set(k, here.get(k) ?? '')
  }
  const s = q.toString()
  return '/' + encodeURIComponent(domain) + suffix + (s ? '?' + s : '')
}
