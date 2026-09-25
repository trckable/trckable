// The Views menu itself: find a view by typing, open it, rename it, delete it.
// Its own chunk, loaded the first time the button is pressed (SavedViews.tsx).
import { Bookmark, Check, ListFilter, Pencil, Search, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { confirm } from './Confirm'
import { InlineEdit } from './InlineEdit'
import { usePhoneLock } from './lockScroll'

import type { View } from './SavedViews'
import './SavedViewsPop.css'

export default function SavedViewsPop<V extends View>({
  views,
  current,
  canSave,
  onOpen,
  onSave,
  onRename,
  onDelete,
  describe,
  btn,
  onClose,
}: {
  views: V[]
  current: string
  canSave: boolean
  onOpen: (v: V) => void
  onSave: () => void
  onRename: (v: V, name: string) => Promise<unknown>
  onDelete: (v: V) => Promise<unknown>
  /** What a view narrows to, in words: "Channel Direct · Campaign launch_week". */
  describe: (query: string) => string
  /** The button that opened it: a click on it is not a click outside. */
  btn: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}) {
  const open = true
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [at, setAt] = useState({ top: 0, right: 0 })
  const pop = useRef<HTMLDivElement>(null)
  usePhoneLock(open)

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    // Right edge under the button's right edge: the button sits at the
    // right of the toolbar, so a menu opening rightwards would leave the screen.
    setAt({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!btn.current?.contains(t) && !pop.current?.contains(t)) close()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (editing) setEditing(null)
      else close()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc, true)
      window.removeEventListener('resize', close)
    }
  }, [open, editing])

  const close = onClose

  const shown = views.filter((v) => v.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <>
      {open &&
        createPortal(
          <div ref={pop} className="pop floating menu-pop sv-pop" role="dialog" aria-label="Saved views" style={{ top: at.top, right: at.right }}>
            <div className="sv-head">
              <b>Saved views</b>
              <span className="faint">
                {views.length} of 30
              </span>
            </div>
            {views.length > 4 && (
              <label className="menu-search">
                <Search size={17} strokeWidth={1.75} aria-hidden="true" />
                <input type="search" placeholder="Find a view" aria-label="Find a view" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
            )}
            {views.length === 0 && <p className="sv-empty">No saved views yet. Filter the dashboard, then save it here to come back in one click.</p>}
            {views.length > 0 && shown.length === 0 && <p className="sv-empty">No view is called that.</p>}
            <ul className="sv-list">
              {shown.map((v) => (
                <li key={v.id} className={v.query === current ? 'on' : undefined}>
                  {editing === v.id ? (
                    <div className="sv-edit">
                      <span className="sv-icon" aria-hidden="true">
                        <Pencil size={15} strokeWidth={1.75} />
                      </span>
                      <InlineEdit editing required maxLength={60} label={`Name of ${v.name}`} value={v.name} onSave={(n) => onRename(v, n)} onDone={() => setEditing(null)} />
                    </div>
                  ) : (
                    <>
                      <button type="button" className="sv-name" onClick={() => (onOpen(v), close())} aria-current={v.query === current}>
                        <span className="sv-icon" aria-hidden="true">
                          {v.query === current ? (
                            <Check size={16} strokeWidth={2.25} aria-hidden="true" />
                          ) : (
                            <Bookmark size={16} strokeWidth={1.75} aria-hidden="true" />
                          )}
                        </span>
                        <span className="sv-text">
                          <span className="sv-title">{v.name}</span>
                          <span className="sv-sub">{describe(v.query) || 'Every visit'}</span>
                        </span>
                      </button>
                      <button type="button" className="sv-act" aria-label={`Rename ${v.name}`} title="Rename" onClick={() => setEditing(v.id)}>
                        <Pencil size={15} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      <button type="button" className="sv-act" aria-label={`Delete ${v.name}`} title="Delete" onClick={async () => {
                          close()
                          await confirm({
                            title: `Delete “${v.name}”?`,
                            body: 'The view goes for everyone on this site. What it shows stays in your data; only the shortcut to it is gone.',
                            confirmLabel: 'Delete view',
                            danger: true,
                            busyLabel: 'Deleting…',
                            run: () => onDelete(v),
                          })
                        }}>
                        <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="sv-foot">
              {canSave ? (
                <button type="button" className="sv-save" onClick={() => (close(), onSave())}>
                  <span aria-hidden="true">+</span> Save what you see now
                  <span className="sv-sub">{describe(current)}</span>
                </button>
              ) : (
                <span className="sv-hint">
                  <ListFilter size={15} strokeWidth={1.75} aria-hidden="true" />
                  Filter the dashboard, then save it here.
                </span>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
