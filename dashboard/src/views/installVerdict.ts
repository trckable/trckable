// What Settings > Verify concludes. A visit that arrived lately with this site's key is proof of the install on its own: the homepage read
// (which can fail, or be rate limited) only adds a note to its step and never turns the headline red.
export type VerifyVerdict = 'checking' | 'working' | 'quiet' | 'missing'

/** snippetOk: the homepage carries this site's id; seen: a visit has been recorded; fresh: the last one is within a day. */
export function verdictOf(o: { checking: boolean; snippetOk: boolean; seen: boolean; fresh: boolean }): VerifyVerdict {
  if (o.checking) return 'checking'
  if (o.seen && o.fresh) return 'working'
  // Visits that stopped and a homepage without the snippet: the install may have been removed.
  return o.snippetOk ? 'quiet' : 'missing'
}

/** A homepage problem is a note (info) while visits are counted, and a failure only without them. */
export const problemTone = (seen: boolean): 'info' | 'fail' => (seen ? 'info' : 'fail')

/** How long an automatic homepage read is reused (opening the tab again): Verify again always reads anew. */
export const REUSE_MS = 120_000
