// Whether Live shows the globe, kept for next time in this browser. Off is the overview, today's layout.
export const GLOBE_KEY = 'trckable.live.globe'

export function readGlobe(): boolean {
  try {
    return localStorage.getItem(GLOBE_KEY) === 'on'
  } catch {
    return false
  }
}

export function keepGlobe(on: boolean) {
  try {
    localStorage.setItem(GLOBE_KEY, on ? 'on' : 'off')
  } catch {
    /* a blocked store only forgets */
  }
}
