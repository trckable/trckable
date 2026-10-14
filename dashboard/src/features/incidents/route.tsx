// Where a site's incident history lives: /{domain}/incidents, with the
// period in the address like the dashboard's (?period, ?from, ?to).

import { sitePagePath } from '../../lib/sitePath'

export const SUFFIX = '/incidents'

/** The address of a site's history; `keep` carries the period the dashboard shows over to it. */
export const incidentsPath = (domain: string, keep = false): string => sitePagePath(domain, SUFFIX, keep)
