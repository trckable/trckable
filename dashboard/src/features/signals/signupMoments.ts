// The signups this tab has seen on the stream, for the bell to list beside what the server records. Kept in memory: a
// signup is told while it happens, and the Briefing's numbers hold the count afterwards.
export interface SignupMoment {
  id: string
  site: string
  /** Unix ms. */
  ts: number
  title: string
  /** The site that sent the person, when one did. */
  source?: string
}

/** The bell lists the newest few. */
const KEEP = 20

let list: SignupMoment[] = []
const heard = new Set<() => void>()

/** Adds the moments not held yet (by id) and tells the listeners when any were new. */
export function noteSignups(_site: string, add: SignupMoment[]) {
  const known = new Set(list.map((m) => m.id))
  const fresh = add.filter((m) => !known.has(m.id))
  if (!fresh.length) return
  list = [...fresh, ...list].sort((a, b) => b.ts - a.ts).slice(0, KEEP)
  heard.forEach((f) => f())
}

export const signupMoments = (): SignupMoment[] => list

export function onSignups(f: () => void): () => void {
  heard.add(f)
  return () => void heard.delete(f)
}
