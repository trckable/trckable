// The search box that opens on ⌘K: type to jump to a table, a site, a period, a filter, or ask Peek (its row leads for a question, and is the last row otherwise).
// Arrow keys and Enter pick; Escape or a press outside closes. Markup and classes are the walkthrough's own.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { MkPortal } from './Portal'
import { askIntent, plain } from '../explore/askIntent'

export interface PaletteItem {
  /** What is typed to find it, and what is shown. */
  title: string
  /** The small word on the right ("site", "peek"); none for a row whose group already says it. */
  kind: string
  /** More words that find it, beside its title ("Explore" for a table, whose group heading says it). */
  also?: string
  group: string
  /** A mark drawn before the title, as SVG. */
  lead?: string
  run: () => void
}

/** Where typing a question goes: Peek, as the first row. */
export interface PaletteAsk {
  run: (question: string) => void
  title: (question: string) => string
  /** The small word on the right of the row ("↵ Ask"). */
  kind: string
  /** The Peek mark that leads the row, as the brand's SVG. */
  lead: string
}

export function Palette({ items, placeholder, none, onClose, initial = '', ask }: { items: PaletteItem[]; placeholder: string; none: (q: string) => string; onClose: () => void; initial?: string; ask?: PaletteAsk }) {
  const [q, setQ] = useState(initial)
  const [at, setAt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const list = useMemo(() => {
    const t = plain(q)
    const hit = items.filter((i) => plain(`${i.title} ${i.also ?? ''}`).includes(t))
    const found = hit.slice(0, 16)
    const text = q.trim()
    if (!ask || !text) return found
    const exact = items.some((i) => plain(i.title) === t || plain(i.also ?? '') === t)
    const place = askIntent(text, hit.length, exact)
    const row = { title: ask.title(text), kind: ask.kind, group: '', lead: ask.lead, run: () => ask.run(text) }
    // A question leads; anything else keeps its jumps first and Peek's row one arrow below them.
    return place === 'first' ? [row, ...found] : [...found, row]
  }, [items, q, ask])
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
        <div className="palbox" role="dialog" aria-modal="true" aria-label={placeholder}>
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
          <div id="palList">
            {list.length === 0 && <div className="mk-quiet" style={{ padding: '14px 12px' }}>{none(q)}</div>}
            {list.map((i, k) => {
              const head = i.group && (k === 0 || list[k - 1].group !== i.group) ? <div className="pgh">{i.group}</div> : null
              return (
                <Fragment key={i.title + i.kind}>
                  {head}
                  <button type="button" className={`pi${k === sel ? ' on' : ''}`} onClick={() => run(i)} onPointerMove={() => k !== sel && setAt(k)}>
                    {i.lead && <span aria-hidden="true" style={{ display: 'flex' }} dangerouslySetInnerHTML={{ __html: i.lead }} />}
                    {i.title}
                    {i.kind && <span className="s">{i.kind}</span>}
                  </button>
                </Fragment>
              )
            })}
          </div>
        </div>
      </div>
    </MkPortal>
  )
}
