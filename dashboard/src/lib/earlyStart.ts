// What the page starts asking for the moment its script runs, instead of when
// React has rendered enough to ask: a shared link's exchange for a session and
// then the report it opens on; for someone signed in, /me and /sites and then
// the report of the site the address names. The dashboard reads the same
// requests when it gets there (they are the cached report, or the same promise).
import { APIError, api, setShareMode, setShareSession, type ShareInfo, type Site } from './api'
import { prefetchSite } from './dashQuery'
import { landing } from './landing'
import { siteForSegment } from './siteRoute'

/** The token out of /s/<token>. It stays in the address bar, so the link can
 *  be copied, bookmarked and reloaded; the page sends no Referer, and the API
 *  calls after the first carry a session cookie instead. */
export const shareToken = () => {
  const m = /^\/s\/([^/]+)/.exec(location.pathname)
  return m ? decodeURIComponent(m[1]) : ''
}

/** ?embed=1: the link is shown inside another site's page. */
export const isEmbed = () => new URLSearchParams(location.search).get('embed') === '1'

export const onSharePage = () => location.pathname === '/s' || location.pathname.startsWith('/s/')

let opening: Promise<ShareInfo> | null = null

/** Opens the link, once however many ask. With a token in the address the
 *  server opens it (a reload of a password link is let in by the session the
 *  first open left); an address cut short to /s has only that cookie to go by. */
export function openShare(): Promise<ShareInfo> {
  opening ??= shareToken()
    ? api.openShare(shareToken(), undefined, isEmbed())
    : api.shareMe().catch(() =>
        // No token in the address and no session left: either the address
        // was cut short, or the time it was open for has passed.
        Promise.reject(new APIError(410, 'This view has closed, or the address is incomplete. Open the full link you were given again, or ask for a new one.')),
      )
  return opening
}

/** A shared link: open it, then ask for the report its dashboard opens on. */
function startShare() {
  setShareMode(true)
  openShare()
    .then((info) => {
      if (info.session) setShareSession(info.session)
      // The address keeps its query, so the dashboard starts from it.
      prefetchSite({ id: 'shared', timezone: info.timezone }, new URLSearchParams(location.search))
    })
    .catch(() => undefined) // the page itself shows why it could not open
}

type Early = ReturnType<typeof api.early>
let early: Early | null = null

/** /me and /sites, and the report of the site the address names. */
function startBoot() {
  early = api.early()
  void early.sites.then((r) => {
    if (!r) return
    const site = namedSite(r.sites)
    if (site) prefetchSite(site)
  })
}

/** The site this address opens: the one it names, else the one the main page lands on. */
function namedSite(sites: Site[]): Site | null {
  const search = new URLSearchParams(location.search)
  return siteForSegment(sites, location.pathname.slice(1)) ?? siteForSegment(sites, landing(sites, search).path.slice(1).split('?')[0])
}

/** The requests start-up already sent (once), else fresh ones. */
export function takeEarly(): Early {
  const e = early ?? api.early()
  early = null
  return e
}

export function startEarly() {
  if (onSharePage()) startShare()
  else startBoot()
}
