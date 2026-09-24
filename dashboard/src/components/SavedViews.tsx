// Saved views in one dropdown: find one by typing, open it, rename it, delete
// it. A row of pills stopped working at a handful of views; a list with a
// search keeps working at thirty (the server's limit).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type View = { id: string; name: string; query: string }

export function SavedViews<V extends View>({
  views,
  current,
  canSave,
  onOpen,
  onSave,
  onRename,
  onDelete,
}: {
  views: V[]
  current: string
  canSave: boolean
  onOpen: (v: V) => void
  onSave: () => void
  onRename: (v: V, name: string) => Promise<unknown>
  onDelete: (v: V) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sure, setSure] = useState<string | null>(null)
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
    setSure(null)
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
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        <span className="sv-btn-name">{active ? active.name : 'Views'}</span>
        {!active && views.length > 0 && <span className="count">{views.length}</span>}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="pop floating sv-pop" role="dialog" aria-label="Saved views" style={{ top: at.top, left: at.left }}>
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
                  ) : sure === v.id ? (
                    <div className="sv-sure">
                      <span>
                        Delete <b>{v.name}</b>?
                      </span>
                      <button type="button" className="btn ghost small" onClick={() => setSure(null)}>
                        Keep
                      </button>
                      <button type="button" className="btn danger small" autoFocus onClick={() => onDelete(v).then(() => setSure(null))}>
                        Delete
                      </button>
                    </div>
                  ) : (
                    <>
                      <button type="button" className="sv-name" onClick={() => (onOpen(v), close())} aria-current={v.query === current}>
                        <span className="sv-check" aria-hidden="true">
                          {v.query === current ? '✓' : ''}
                        </span>
                        <span>{v.name}</span>
                      </button>
                      <button type="button" className="sv-act" aria-label={`Rename ${v.name}`} title="Rename" onClick={() => (setDraft(v.name), setEditing(v.id))}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                        </svg>
                      </button>
                      <button type="button" className="sv-act" aria-label={`Delete ${v.name}`} title="Delete" onClick={() => setSure(v.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                        </svg>
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="sv-foot">
              {canSave ? (
                <button type="button" className="btn ghost small filter-save" onClick={() => (close(), onSave())}>
                  + Save what you see now
                </button>
              ) : (
                <span className="faint">Add a filter to save a new view.</span>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
