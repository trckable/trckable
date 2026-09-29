// Whether Live's connection is up. Live's panels set it; the Live | Data
// switch, which is always on screen, reads it and dims its dot while the
// connection is down.
import { miniStore } from '../../lib/miniStore'

export const liveLink = miniStore(true)
