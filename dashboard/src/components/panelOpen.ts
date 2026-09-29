// Whether the Filter menu and the saved views' list are open. Stores, so a
// phone's sheet and ⋯ can hand over to them once they have closed themselves.
import { miniStore } from '../lib/miniStore'

export const filterMenu = miniStore(false)
export const savedViews = miniStore(false)
