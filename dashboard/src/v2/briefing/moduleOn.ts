// Whether a module is on for a site, read once a minute: the Briefing asks for speed and Search Console numbers only
// where the server measures them, so a site with the module off is not met with a stream of 404s.
import { api } from '../../lib/api'

const kept = new Map<string, { at: number; on: Promise<Set<string> | null> }>()

export function moduleOn(site: string, id: string): Promise<boolean> {
  let k = kept.get(site)
  if (!k || Date.now() - k.at > 60_000) {
    k = { at: Date.now(), on: api.modules(site).then((r) => new Set(r.modules.filter((m) => m.enabled).map((m) => m.id)), () => null) }
    kept.set(site, k)
  }
  // A list that could not be read says nothing: ask as before.
  return k.on.then((s) => s === null || s.has(id))
}
