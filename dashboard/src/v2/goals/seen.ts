// The suggestions the person has already been shown (by opening the Goals menu), kept per site in this browser only.
const key = (site: string) => `trckable:goals-seen:${site}`

export function readSeen(site: string): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key(site)) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function markSeen(site: string, paths: string[]): string[] {
  const all = [...new Set([...readSeen(site), ...paths])]
  try {
    localStorage.setItem(key(site), JSON.stringify(all))
  } catch {
    // Private window or blocked storage: the dot simply comes back next time.
  }
  return all
}
