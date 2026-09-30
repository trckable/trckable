// A heading in the switcher: Pinned, a named group, or the other sites. A
// group's heading folds it and has its own ⋯ menu (rename, move, remove);
// a site dragged onto any heading goes first under it (useReorder).
import { ChevronRight } from 'lucide-react'
import { Menu } from '../../components/Menu'
import { confirm, confirmWith } from '../../components/Confirm'
import { copy } from './menuCopy'
import { removeGroup, renameGroup, stepGroup, type Place } from './layout'
import type { Arrange } from './SiteMenu'

const TITLE: Record<'pinned' | 'rest', string> = { pinned: copy.pinned, rest: copy.others }

export function SectionHead({ place, count, shut, onFold, arrange: a }: { place: Place; count: number; shut: boolean; onFold: () => void; arrange: Arrange | null }) {
  if (place.kind !== 'group')
    return (
      <h3 className="site-head">
        {TITLE[place.kind]}
      </h3>
    )
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
        <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
        <span>{copy.collapse(name, count)}</span>
      </button>
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
    </h3>
  )
}
