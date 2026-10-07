// The Create menu's list (CreateMenu.tsx): a goal, a funnel or a note, each
// only while its module is on (lib/modules.ts). It is the kit Popover's panel
// (components/AnchoredPop), opened by a key as well as a click, so CreateMenu
// owns whether it is open.
// Its own chunk, so the first load carries only the button.
import { Filter, StickyNote, Target, type LucideIcon } from 'lucide-react'
import type { RefObject } from 'react'
import { AnchoredPop } from '../../components/AnchoredPop'
import type { CreateId } from '../../lib/modules'
import { copy } from './copy'
import '../../components/sheet.css'

type Item = { id: CreateId; icon: LucideIcon; label: string; hint: string; run: () => void }

export interface CreatePopProps {
  /** The ⋯ button: the list opens under it. */
  anchor: RefObject<HTMLElement | null>
  items: CreateId[]
  onGoal: () => void
  onNote: () => void
  onFunnel: () => void
  onClose: () => void
}

export default function CreatePop(p: CreatePopProps) {
  const all: Item[] = [
    { id: 'goal', icon: Target, label: copy.goal, hint: copy.goalHint, run: p.onGoal },
    { id: 'funnel', icon: Filter, label: copy.funnel, hint: copy.funnelHint, run: p.onFunnel },
    { id: 'note', icon: StickyNote, label: copy.note, hint: copy.noteHint, run: p.onNote },
  ]
  const items = all.filter((it) => p.items.includes(it.id))
  return (
    <AnchoredPop anchor={p.anchor} label={copy.menu} className="menu create-menu" onClose={p.onClose}>
      {(close) => (
        <div className="menu-list" role="menu" aria-label={copy.menu}>
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              data-create={it.id}
              onClick={() => {
                close()
                it.run()
              }}
            >
              <it.icon size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className="create-item">
                <b>{it.label}</b>
                <span className="faint">{it.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </AnchoredPop>
  )
}
