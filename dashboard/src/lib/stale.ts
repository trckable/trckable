// A tab opened before a deploy still runs the old build, and the chunks that
// build asks for are gone: its next import() fails ("Failed to fetch
// dynamically imported module"). Reloading takes the new build, with the
// address (period, filters) as it was. A failed import is not proof by itself
// (a page being left aborts its own downloads), so the page asks the server
// which build it is serving now. Once a minute at most, so a server that
// still answers with the old build can never make a loop.
const KEY = 'trckable:reloaded'
let going: Promise<boolean> | undefined

/** The failure of a chunk that is not there, in each browser's words. */
export const staleChunk = (e: unknown) => /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(e instanceof Error ? e.message : String(e))

async function reload() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY)) < 60_000) return false
    const entry = document.querySelector('script[type=module][src]')?.getAttribute('src') ?? ''
    if ((await (await fetch('/', { cache: 'no-store' })).text()).includes(entry)) return false // still the same build: nothing is stale
    sessionStorage.setItem(KEY, String(Date.now()))
    location.reload()
    return true
  } catch {
    return false // storage blocked or offline: no way to tell a loop, so no reload
  }
}

/** Reloads the page when the server runs another build than this page, once a minute at most; true while that is under way. */
export const reloadOnce = () => (going ??= reload().then((up) => (up ? up : ((going = undefined), up))))
