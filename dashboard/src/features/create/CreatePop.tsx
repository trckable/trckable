// The Create menu's list (CreateMenu.tsx): a goal, a funnel or a note, each
// only while its module is on (lib/modules.ts).
// Its own chunk, so the first load carries only the button.
import { Filter, StickyNote, Target, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { CreateId } from '../../lib/modules'
import { copy } from './copy'

type Item = { id: CreateId; icon: LucideIcon; label: string; hint: string; run: () => void }

export interface CreatePopProps {
  items: CreateId[]
  onGoal: () => void
  onNote: () => void
  onFunnel: () => void
  onClose: () => void
}

export default function CreatePop(p: CreatePopProps) {
  const root = useRef<HTMLDivElement>(null)
  // Opened by its key, the first choice has focus, ready for the arrows.
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
  }, [])
  const all: Item[] = [
    { id: 'goal', icon: Target, label: copy.goal, hint: copy.goalHint, run: p.onGoal },
    { id: 'funnel', icon: Filter, label: copy.funnel, hint: copy.funnelHint, run: p.onFunnel },
    { id: 'note', icon: StickyNote, label: copy.note, hint: copy.noteHint, run: p.onNote },
  ]
  const items = all.filter((it) => p.items.includes(it.id))
  return (
    <div ref={root} className="pop menu create-menu" role="menu" aria-label={copy.menu}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          data-create={it.id}
          onClick={() => {
            p.onClose()
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
  )
}
