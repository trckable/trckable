// The note after a quiet spell: while a site is down or quiet its card keeps
// the time of the last visit before the gap; when visits return, the first
// one after it closes the gap, and the note stands for a day. Per browser:
// the sites list holds no history, so only a gap this browser saw is told.
const KEY = (site: string) => 'trckable.gap.' + site
const DAY = 86400

export interface Gap {
  since: number
  back?: number
}

export function readGap(site: string): Gap | null {
  try {
    const g = JSON.parse(localStorage.getItem(KEY(site)) ?? 'null') as Gap | null
    return g && typeof g.since === 'number' ? g : null
  } catch {
    return null
  }
}

export function writeGap(site: string, gap: Gap | null) {
  try {
    if (gap) localStorage.setItem(KEY(site), JSON.stringify(gap))
    else localStorage.removeItem(KEY(site))
  } catch {
    // storage blocked: the note is only a courtesy
  }
}

/** The first visit after the gap, from recent visits' times (unix seconds, any order). */
export function firstAfter(since: number, times: number[]): number | undefined {
  const later = times.filter((t) => t > since)
  return later.length ? Math.min(...later) : undefined
}

/** Whether a closed gap is still worth a line: a day from the return. */
export function fresh(g: Gap, now = Date.now()): boolean {
  return g.back !== undefined && now / 1000 - g.back < DAY
}
