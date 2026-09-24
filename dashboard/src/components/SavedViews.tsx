// Saved views in one dropdown: find one by typing, open it, rename it, delete
// it. A row of pills stopped working at a handful of views; a list with a
// search keeps working at thirty (the server's limit).
import { Bookmark, Check, ChevronDown, ListFilter, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { confirm } from './Confirm'

export type View = { id: string; name: string; query: string }

export function SavedViews<V extends View>({
  views,
  current,
  canSave,
  onOpen,
  onSave,
  onRename,
  onDelete,
  describe,
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
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [at, setAt] = useState({ top: 0, left: 0 })
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const active = views.find((v) => v.query === current)

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    setAt({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 340)) })
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

  function close() {
    setOpen(false)
    setQ('')
    setEditing(null)
  }

  const shown = views.filter((v) => v.name.toLowerCase().includes(q.trim().toLowerCase()))
  const rename = (v: V) => {
    const name = draft.trim()
    if (!name || name === v.name) return setEditing(null)
    onRename(v, name).then(() => setEditing(null))
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={'btn sv-btn' + (active ? ' on' : '')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Bookmark size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="sv-btn-name">{active ? active.name : 'Views'}</span>
        {!active && views.length > 0 && <span className="count">{views.length}</span>}
        <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="pop floating sv-pop" role="dialog" aria-label="Saved views" style={{ top: at.top, left: at.left }}>
            <div className="sv-head">
              <b>Saved views</b>
              <span className="faint">
                {views.length} of 30
              </span>
            </div>
            {views.length > 4 && (
              <input className="sv-search" type="search" placeholder="Find a view" aria-label="Find a view" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
            )}
            {views.length === 0 && <p className="sv-empty">No saved views yet. Filter the dashboard, then save it here to come back in one click.</p>}
            {views.length > 0 && shown.length === 0 && <p className="sv-empty">No view is called that.</p>}
            <ul className="sv-list">
              {shown.map((v) => (
                <li key={v.id} className={v.query === current ? 'on' : undefined}>
                  {editing === v.id ? (
                    <form className="sv-edit" onSubmit={(e) => (e.preventDefault(), rename(v))}>
                      <input
                        autoFocus
                        maxLength={60}
                        value={draft}
                        aria-label={`New name for ${v.name}`}
                        onChange={(e) => setDraft(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button type="submit" className="btn primary small">
                        Save
                      </button>
                    </form>
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
                      <button type="button" className="sv-act" aria-label={`Rename ${v.name}`} title="Rename" onClick={() => (setDraft(v.name), setEditing(v.id))}>
                        <Pencil size={15} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      <button type="button" className="sv-act" aria-label={`Delete ${v.name}`} title="Delete" onClick={async () => {
                          close()
                          if (await confirm({ title: `Delete “${v.name}”?`, body: 'The view goes for everyone on this site. What it shows stays in your data; only the shortcut to it is gone.', confirmLabel: 'Delete view', danger: true })) onDelete(v)
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
