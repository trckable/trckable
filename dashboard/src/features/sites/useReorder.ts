// Dragging a site in the switcher: the shared drag list (lib/useDragList: the lifted row, the others sliding, the drop line, Esc)
// with what a place means here, the saved layout. `target` turns the pointer into a place (pinned, a group, the rest) and
// the site it goes before.
import type { RefObject } from 'react'
import type { Site, SiteLayout } from '../../lib/api'
import { useDragList } from '../../lib/useDragList'
import { moveTo, placeKey, type Place, type Section } from './layout'

/** Where the pointer says the site goes: which place, and before which site (none: last there). */
function target(list: HTMLElement, id: string, y: number, places: Map<string, Place>, sections: Section[]): { place: Place; before?: string } | null {
  const inside = (el: Element) => {
    const r = el.getBoundingClientRect()
    return y >= r.top && y < r.bottom
  }
  const placeOf = (el: Element) => places.get(el.closest<HTMLElement>('[data-section]')?.dataset.section ?? '')
  for (const head of list.querySelectorAll('.site-head')) {
    const place = inside(head) && placeOf(head)
    if (place) return { place, before: sections.find((s) => placeKey(s.place) === placeKey(place))?.sites.find((s) => s.id !== id)?.id }
  }
  for (const li of list.querySelectorAll<HTMLElement>('li[data-site], li.sites-none')) {
    const place = li.dataset.site !== id && inside(li) && placeOf(li)
    if (!place) continue
    if (!li.dataset.site) return { place }
    const r = li.getBoundingClientRect()
    if (y <= r.top + r.height / 2) return { place, before: li.dataset.site }
    let next = li.nextElementSibling as HTMLElement | null
    if (next?.dataset.site === id) next = next.nextElementSibling as HTMLElement | null
    return { place, before: next?.dataset.site }
  }
  return null
}

export function useReorder(sites: Site[], layout: SiteLayout, sections: Section[], save: (l: SiteLayout) => void, list: RefObject<HTMLElement | null>) {
  const places = () => new Map(sections.map((s) => [placeKey(s.place), s.place]))
  return useDragList<SiteLayout>({
    key: 'site',
    current: layout,
    save,
    list,
    resolve: (box, id, y, preview) => {
      const to = target(box, id, y, places(), sections)
      return to ? moveTo(sites, preview, id, to.place, to.before) : null
    },
  })
}
