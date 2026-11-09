// The charts of What changed and Overview as chunks that Explore asks for when it opens, so they are there by the time the cards under them are.
import { lazyLoad } from '../../../lib/lazyLoad'

export const ChangedChart = lazyLoad(() => import('./ChangedChart'))
export const OverviewChart = lazyLoad(() => import('./OverviewChart'))
