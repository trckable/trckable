import { copy } from '../loading/copy'
import { Loading } from '../loading/Loading'
import { dashHtml } from './dashMarkup'
import './DashSkeleton.css'

/** The whole dashboard on its way, as index.html draws it first: the app shows the same picture while it asks who is here. */
export function DashboardSkeleton() {
  return <div className="dsk-root" dangerouslySetInnerHTML={{ __html: dashHtml(copy.boot) }} />
}

/** What the app shows while it asks who is here: the dashboard's boxes where one is expected (theme.js saw a kept site list), the ghost anywhere else. */
export function Booting() {
  return document.documentElement.dataset.boot ? <DashboardSkeleton /> : <Loading size="page" />
}
