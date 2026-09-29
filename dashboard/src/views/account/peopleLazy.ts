// The People row's popovers and its confirmation are their own chunks, fetched
// when the browser is idle or a pointer reaches the button that opens one.
import { lazyLoad } from '../../lib/lazyLoad'

export const SitesPop = lazyLoad(() => import('./SitesPop'))
export const RolePop = lazyLoad(() => import('./RolePop'))
export const RoleDialog = lazyLoad(() => import('./RoleDialog'))
