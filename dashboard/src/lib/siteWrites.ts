// What a write to a site changed, said once for everything that shows it. Every write goes through `call` (api.ts), which
// announces it here; a card that depends on what was written (the modules a site records, the questions Answers asks)
// listens and reads again, so switching something on shows its first state at once, with no reload and no per-card wiring.
type Listener = (area: Area, site: string) => void

/** The parts of a site that Live's cards and the module switches read. */
export type Area = 'modules' | 'answers' | 'mentions'

const AREAS: readonly Area[] = ['modules', 'answers', 'mentions']
const listeners = new Set<Listener>()

/** The area and site a write path names (`/sites/<id>/modules/vitals`), or none for any other write. */
export function areaOf(path: string): { area: Area; site: string } | null {
  const m = /^\/sites\/([^/?]+)\/([a-z]+)/.exec(path)
  const area = AREAS.find((a) => a === m?.[2])
  return m && area ? { area, site: decodeURIComponent(m[1]) } : null
}

/** Called by `call` after a write succeeded. */
export function announceSiteWrite(path: string) {
  const hit = areaOf(path)
  if (hit) listeners.forEach((f) => f(hit.area, hit.site))
}

/** Runs `f` after every write to one of these areas; the returned function stops it. */
export function onSiteWrite(f: Listener): () => void {
  listeners.add(f)
  return () => void listeners.delete(f)
}
