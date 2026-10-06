// Whether Live's connection is up. Live's panels set it; the Live | Data
// switch, which is always on screen, reads it and dims its dot while the
// connection is down.
import { miniStore } from '../../lib/miniStore'

export const liveLink = miniStore(true)

/** How many are on the site now, for the switch ("Live · 20"). Data and Live
    set it from the count they show; null while neither knows it. */
export const liveCount = miniStore<number | null>(null)
