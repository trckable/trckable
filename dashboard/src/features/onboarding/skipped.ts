// Whether this account chose "Skip for now" in the first run, so the first run
// does not come back for sites that are still waiting for their first visit, or
// for an account with no site yet (it lands on its empty page instead). Kept per
// account, so a second person in the same browser still gets their own first run.
const PREFIX = 'trckable.onboarding.skipped.'
const memory = new Set<string>() // a private window: the skip holds for this session

const keyOf = (who: string | undefined) => PREFIX + (who ?? '').toLowerCase()

export function wasSkipped(who: string | undefined): boolean {
  const key = keyOf(who)
  if (memory.has(key)) return true
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function markSkipped(who: string | undefined) {
  const key = keyOf(who)
  memory.add(key)
  try {
    localStorage.setItem(key, '1')
  } catch {
    // Private window: the skip holds for this session only.
  }
}

/** "Add your first site" on the empty page: the first run is wanted again. */
export function clearSkipped(who: string | undefined) {
  const key = keyOf(who)
  memory.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing stored to clear.
  }
}
