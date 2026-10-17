// What the list that opens from the header hands each row and heading so an owner can arrange it: the sites and the saved
// layout, how to save a change (with the words a screen reader says), and the drag in progress.
import type { Site, SiteLayout } from '../../lib/api'

export interface Arrange {
  sites: Site[]
  layout: SiteLayout
  save: (l: SiteLayout, said?: string) => void
  /** The site being dragged, and where a press on a row starts a drag. */
  drag: string | null
  grab: (e: React.PointerEvent<HTMLElement>, id: string) => void
}
