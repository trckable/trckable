// The marker whose card is open: its pins (the most important first, then the
// ones that landed beside it) and which the card is on. Kept apart from the
// chart so the card survives the chart redrawing under a new filter, and so the
// card on opening can step aside while one is open.
import { miniStore } from '../../lib/miniStore'
import type { Pin } from './pins'

export const openMark = miniStore<{ pins: Pin[]; at: number } | null>(null)
