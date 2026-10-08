// How anything else in the app (the notification bell) opens the surge's detailed
// dialog: openSurgeStory(id) for that surge, or with no id for the one that is on.
// The card listens while it is mounted, even after it was put away.
const EVENT = 'trckable:surge-story'

/** Opens the detailed surge dialog; the surge with this id, or the current one when none is named. */
export function openSurgeStory(id?: string) {
  window.dispatchEvent(new CustomEvent<string | undefined>(EVENT, { detail: id }))
}

/** The card's side: calls open when its surge is asked for. Returns the stop. */
export function onOpenSurgeStory(id: string, open: () => void): () => void {
  const on = (e: Event) => {
    const want = (e as CustomEvent<string | undefined>).detail
    if (!want || want === id) open()
  }
  window.addEventListener(EVENT, on)
  return () => window.removeEventListener(EVENT, on)
}
