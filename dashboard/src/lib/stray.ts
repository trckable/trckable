// An address that names no page of the app: what happens to it. A site's address with something after it that is not one
// of its pages (/example.com/nope) is the site's dashboard at its own address; an address that names none of the sites goes to the
// main dashboard (landing.ts) and says so, so the person is not left wondering why this site opened.
import type { Site } from './api'
import { openAddSite } from './account'
import { landing, tidyPath } from './landing'
import { strayCopy as copy } from './strayCopy'
import { toast } from '../components/toastBus'
import { navigate } from './url'

/** Addresses the app answers with the main dashboard by design: nothing to say about them. */
const QUIET = /^\/(login|setup|settings|account|all)?\/?$/

/** What the address calls the site, as typed. */
function named(path: string): string {
  try {
    return decodeURIComponent(path.slice(1))
  } catch {
    return path.slice(1)
  }
}

/** An address that does not name one of the person's pages: tidy it, or send it to the main dashboard and say so. */
export function leaveStray(sites: Site[], path: string, route: { site: Site | null; sub: string | null }) {
  if (route.site) {
    const tidy = route.sub === null ? tidyPath(route.site, path) : null
    if (tidy) navigate(tidy + location.search + location.hash, { replace: true })
    return
  }
  const to = landing(sites, new URLSearchParams(location.search))
  navigate(to.path, { replace: true })
  if (to.wizard) openAddSite()
  else if (!QUIET.test(path)) toast(copy.noSite(named(path)), 'info')
}
