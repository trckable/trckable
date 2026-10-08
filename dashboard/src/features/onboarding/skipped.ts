// Whether this browser chose "Skip for now" in the first run, so the first run
// does not come back for sites that are still waiting for their first visit.
const KEY = 'trckable.onboarding.skipped'

export function wasSkipped(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markSkipped() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Private window: the skip holds for this session only.
  }
}
