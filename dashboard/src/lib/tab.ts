// The tab a person last chose (Live, Briefing or Data), kept in this browser so
// a bare address opens where they left off. Only the Briefing is remembered:
// Live stays what a bare address opens, and Data is what an address with a
// period or filters already says.
export type Tab = 'live' | 'briefing' | 'data'

const KEY = 'trckable.tab'

/** Whether a bare address opens the Briefing for someone who has not chosen yet. Off: Live stays the first screen. */
const BRIEFING_FIRST = false

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Keep a choice; leaving the Briefing for Live or Data forgets it. */
export function rememberTab(t: Tab) {
  try {
    localStorage.setItem(KEY, t === 'briefing' ? 'briefing' : 'other')
  } catch {
    /* private window: the tab is simply not remembered */
  }
}

/** A bare address opens the Briefing: the last choice, or the setting when there was none. */
export function wantsBriefing(): boolean {
  const k = read()
  return k === null ? BRIEFING_FIRST : k === 'briefing'
}
