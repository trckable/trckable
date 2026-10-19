// A link that wants the connect sheet open when AI & Search appears (Live's "Set up"): it asks once, and the tab takes
// the ask when it mounts.
let asked = false

export const crawlerSetupAsked = () => {
  asked = true
}

/** True once for each ask. */
export function takeCrawlerSetupAsk(): boolean {
  const was = asked
  asked = false
  return was
}
