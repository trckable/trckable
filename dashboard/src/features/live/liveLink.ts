// Whether Live's connection is up. Live's panels set it; the Live | Data
// switch, which is always on screen, reads it and dims its dot while the
// connection is down.
import { useEffect } from 'react'
import { miniStore } from '../../lib/miniStore'

export const liveLink = miniStore(true)

/** How many are on the site now, for the switch ("Live · 20"). Data and Live
    set it from the count they show; null while neither knows it. */
export const liveCount = miniStore<number | null>(null)

/** Whether the site on screen is not answering our checks, for the switch's red dot. */
export const siteDown = miniStore(false)

/** Sets the switch's red dot from the site on screen, and clears it when the page goes. */
export function useSiteDown(down: boolean) {
  useEffect(() => {
    siteDown.set(down)
    return () => siteDown.set(false)
  }, [down])
}

/** Sets the switch's count from the number the page shows, and clears it when the page goes. */
export function useLiveCount(online: number | null | undefined) {
  useEffect(() => {
    liveCount.set(online ?? null)
    return () => liveCount.set(null)
  }, [online])
}
