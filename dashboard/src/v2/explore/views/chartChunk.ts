// The What changed chart as a chunk that Explore asks for when it opens, so it is there by the time the cards under it are.
import { lazyLoad } from '../../../lib/lazyLoad'

export const ChangedChart = lazyLoad(() => import('./ChangedChart'))
