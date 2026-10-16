// Which page's details are open over Explore (null for none).
import { miniStore } from '../../lib/miniStore'

export const pageDetails = miniStore<string | null>(null)
