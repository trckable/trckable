// A heading in the site list: Pinned, a named group, or the other sites, just its name. A group's heading folds it and has its own ⋯ menu
// (rename, move, remove; shown on hover or focus, always on touch); a site dragged onto any heading goes first under it. The first heading
// carries the small column label over the numbers.
import { ChevronRight } from 'lucide-react'
import { Menu } from '../../components/Menu'
import { confirm, confirmWith } from '../../components/Confirm'
import { copy } from '../../features/sites/menuCopy'
import { removeGroup, renameGroup, stepGroup, type Place } from '../../features/sites/layout'
import type { Arrange } from '../../features/sites/arrange'

const TITLE: Record<'pinned' | 'rest', string> = { pinned: copy.pinned, rest: copy.others }

export function SiteHead({ place, shut, onFold, arrange: a, column }: { place: Place; shut: boolean; onFold: () => void; arrange: Arrange | null; column: boolean }) {
  const label = column ? <span className="col-head">{copy.todayHead}</span> : null
  if (place.kind !== 'group') {
    return (
      <h3 className="site-head">
        <span className="fold">{TITLE[place.kind]}</span>
        {label}
        <span className="head-acts" />
      </h3>
    )
  }
  const name = place.name
  const rename = async () => {
    const to = (await confirmWith({ title: copy.renameTitle(name), confirmLabel: copy.save, field: { label: copy.groupName, type: 'text' } }))?.trim()
    if (to && a) a.save(renameGroup(a.layout, name, to))
  }
  const remove = async () => {
    const ok = await confirm({ title: copy.removeGroupTitle(name), body: copy.removeGroupBody, confirmLabel: copy.remove, danger: true })
    if (ok && a) a.save(removeGroup(a.layout, name), copy.removeGroup)
  }
  return (
    <h3 className="site-head group">
      <button type="button" className="fold" aria-expanded={!shut} onClick={onFold}>
        <span>{name}</span>
        <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
      </button>
      {label}
      <span className="head-acts">
      {a && (
        <Menu label={copy.groupOptions(name)}>
          {(close) => {
            const item = (label: string, fn: () => void) => (
              <button type="button" role="menuitem" onClick={() => { close(); fn() }}>
                {label}
              </button>
            )
            return (
              <>
                {item(copy.rename, () => void rename())}
                {item(copy.groupUp, () => a.save(stepGroup(a.layout, name, -1), copy.groupUp))}
                {item(copy.groupDown, () => a.save(stepGroup(a.layout, name, 1), copy.groupDown))}
                {item(copy.removeGroup, () => void remove())}
              </>
            )
          }}
        </Menu>
      )}
      </span>
    </h3>
  )
}
