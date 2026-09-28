// Saved views in one dropdown: find one by typing, open it, rename it, delete
// it. A row of pills stopped working at a handful of views; a list with a
// search keeps working at thirty (the server's limit). The menu is its own
// chunk (SavedViewsPop.tsx), loaded the first time the button is pressed.
import { Bookmark, ChevronDown } from 'lucide-react'
import { lazy, Suspense, useRef, useState } from 'react'
import type PopType from './SavedViewsPop'

export type View = { id: string; name: string; query: string }

// lazy() drops the menu's generic type; a type-only import keeps it, and
// brings no code into the first load.
const SavedViewsPop = lazy(() => import('./SavedViewsPop')) as unknown as typeof PopType

export function SavedViews<V extends View>(p: {
  views: V[]
  current: string
  canSave: boolean
  onOpen: (v: V) => void
  onSave: () => void
  onRename: (v: V, name: string) => Promise<unknown>
  onDelete: (v: V) => Promise<unknown>
  /** What a view narrows to, in words: "Channel Direct · Campaign launch_week". */
  describe: (query: string) => string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const active = p.views.find((v) => v.query === p.current)
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={'btn sv-btn' + (active ? ' on' : '')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bookmark size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="sv-btn-name">{active ? active.name : 'Views'}</span>
        {!active && p.views.length > 0 && <span className="count">{p.views.length}</span>}
        <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <Suspense fallback={null}>
          <SavedViewsPop {...p} btn={btn} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
