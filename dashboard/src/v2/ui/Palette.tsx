// The search box that opens on ⌘K: type to jump to a table, a site, a period, a filter, or ask Peek (the first row).
// Arrow keys and Enter pick; Escape or a press outside closes. Markup and classes are the walkthrough's own.
import { useEffect, useMemo, useRef, useState } from 'react'
import { MkPortal } from './Portal'

export interface PaletteItem {
  /** What is typed to find it, and what is shown. */
  title: string
  /** The small word on the right ("table", "site", "peek"). */
  kind: string
  group: string
  run: () => void
}

export function Palette({ items, placeholder, none, onClose, initial = '' }: { items: PaletteItem[]; placeholder: string; none: (q: string) => string; onClose: () => void; initial?: string }) {
  const [q, setQ] = useState(initial)
  const [at, setAt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const list = useMemo(() => {
    const t = q.toLowerCase().trim()
    return items.filter((i) => i.title.toLowerCase().includes(t)).slice(0, 16)
  }, [items, q])
  const sel = Math.max(0, Math.min(at, list.length - 1))
  const run = (i: PaletteItem | undefined) => {
    onClose()
    i?.run()
  }
  return (
    <MkPortal>
      <div
        className="pal on"
        role="presentation"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('.palbox')) onClose()
        }}
      >
        <div className="palbox">
          <input
            ref={input}
            placeholder={placeholder}
            autoComplete="off"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setAt(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                setAt(sel + 1)
                e.preventDefault()
              } else if (e.key === 'ArrowUp') {
                setAt(sel - 1)
                e.preventDefault()
              } else if (e.key === 'Enter') run(list[sel])
              else if (e.key === 'Escape') {
                e.stopPropagation()
                onClose()
              }
            }}
          />
          <div>
            {list.length === 0 && <div className="mk-quiet" style={{ padding: '14px 12px' }}>{none(q)}</div>}
            {list.map((i, k) => {
              const head = k === 0 || list[k - 1].group !== i.group ? <div className="pgh">{i.group}</div> : null
              return (
                <div key={i.title + i.kind} style={{ display: 'contents' }}>
                  {head}
                  <button type="button" className={`pi${k === sel ? ' on' : ''}`} onClick={() => run(i)}>
                    {i.title}
                    <span className="s">{i.kind}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </MkPortal>
  )
}
