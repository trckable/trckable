// Where a site's incident history lives: /{domain}/incidents, with the
// period in the address like the dashboard's (?period, ?from, ?to).

export const SUFFIX = '/incidents'

/** The address of a site's history; `keep` carries the period the dashboard shows over to it. */
export function incidentsPath(domain: string, keep = false): string {
  const q = new URLSearchParams()
  if (keep) {
    const here = new URLSearchParams(location.search)
    for (const k of ['period', 'from', 'to']) if (here.get(k)) q.set(k, here.get(k) ?? '')
  }
  const s = q.toString()
  return '/' + encodeURIComponent(domain) + SUFFIX + (s ? '?' + s : '')
}
