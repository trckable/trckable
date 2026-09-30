// A temporary switch for the try-out: ?chart=A|B|C|D|E picks a model for the
// main chart, ?cards=new the new Full mode cards. Read once, when the page
// loads (the app rewrites its own address as it goes). Without them nothing
// changes. Removed together with the models nobody picks.
import type { ChartModel } from '../charts/models/types'

const query = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
const asked = (query.get('chart') ?? '').toUpperCase()
const model = (['A', 'B', 'C', 'D', 'E'] as const).find((m) => m === asked) ?? null
const cards = query.get('cards') === 'new'

export const chartModel = (): ChartModel | null => model
export const newCards = (): boolean => cards
/** The models about the period before draw it whether or not Compare is on. */
export const needsPrev = (): boolean => model === 'C' || model === 'E'
