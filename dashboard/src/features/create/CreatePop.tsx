// The Create menu's list (CreateMenu.tsx): a goal, a funnel or a note, each
// only while its module is on (lib/modules.ts).
// Its own chunk, so the first load carries only the button.
import { Filter, StickyNote, Target, type LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CreateId } from '../../lib/modules'
import { copy } from './copy'
import '../../components/sheet.css'

type Item = { id: CreateId; icon: LucideIcon; label: string; hint: string; run: () => void }

export interface CreatePopProps {
  /** The ⋯ button: the picker opens under it, aligned to its right edge. */
  anchor: HTMLElement | null
  items: CreateId[]
  onGoal: () => void
  onNote: () => void
  onFunnel: () => void
  onClose: () => void
}

export default function CreatePop(p: CreatePopProps) {
  const root = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; right: number } | null>(null)
  // Under the button like the ⋯ menu itself, flipped above only when there is no room below.
  useLayoutEffect(() => {
    if (!p.anchor) return
    const r = p.anchor.getBoundingClientRect()
    const height = root.current?.offsetHeight ?? 180
    const below = window.innerHeight - r.bottom
    const top = below < height + 16 ? r.top - height - 6 : r.bottom + 6
    // The page may be scrolled so the button is out of sight (the key works from anywhere): then the list sits at the top of the window, never above it.
    setAt({ top: Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8)), right: Math.max(8, window.innerWidth - r.right) })
  }, [p.anchor])
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
  const menu = (
    <div ref={root} className={p.anchor ? 'pop menu floating create-menu' : 'pop menu create-menu'} role="menu" aria-label={copy.menu} style={at ?? undefined}>
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
  // On the page body, like the ⋯ menu itself: no ancestor can shift or clip it.
  return p.anchor ? createPortal(menu, document.body) : menu
}
