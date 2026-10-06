// "Find anything": ⌘K over this report's pages, sources, countries, devices
// and goals. A combobox: type, arrows, Enter; Esc closes. Choosing a result
// opens that tile's panel filtered to the row (search.ts).
import { useMemo, useRef, useState } from 'react'
import { fmtInt } from '../../lib/format'
import { copy } from './copy'
import { pickOf, search, type Item, type Pick } from './search'
import { useSheet } from './useSheet'

interface Props {
  items: Item[]
  opener: HTMLElement | null
  /** Opens Peek: the first row, when it can be. */
  onAsk?: () => void
  onPick: (p: Pick) => void
  onClose: () => void
}

export function Palette({ items, opener, onAsk, onPick, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const found = useMemo(() => search(items, q), [items, q])
  // Row 0 is Ask Peek when Peek can be opened; the results follow.
  const lead = onAsk ? 1 : 0
  const total = found.length + lead
  const cur = Math.min(at, Math.max(0, total - 1))
  useSheet(box, onClose, opener)
  const go = (n: number) => {
    if (n < lead) onAsk?.()
    else if (found[n - lead]) onPick(pickOf(found[n - lead]))
  }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAt((cur + 1) % Math.max(1, total))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAt((cur - 1 + total) % Math.max(1, total))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(cur)
    }
  }
  return (
    <div className="g-pal-wrap">
      <button type="button" className="g-backdrop" aria-label={copy.close} tabIndex={-1} onClick={onClose} />
      <div ref={box} className="g-pal" role="dialog" aria-modal="true" aria-label={copy.paletteLabel} tabIndex={-1}>
        <input
          data-first=""
          className="g-pal-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="g-pal-list"
          aria-activedescendant={total ? `g-pal-${cur}` : undefined}
          aria-label={copy.findLabel}
          placeholder={copy.findPlaceholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setAt(0)
          }}
          onKeyDown={key}
        />
        <ul id="g-pal-list" className="g-pal-list" role="listbox" aria-label={copy.findResults(found.length)}>
          {onAsk && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- the options are driven by the combobox input's keys
            <li id="g-pal-0" role="option" aria-selected={cur === 0} className={cur === 0 ? 'on' : ''} onMouseMove={() => setAt(0)} onClick={() => go(0)}>
              <span className="g-pal-label">{q.trim() ? copy.askPeekQ(q.trim()) : copy.askPeek}</span>
            </li>
          )}
          {found.map((it, n) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- the options are driven by the combobox input's keys
            <li key={it.kind + it.key} id={`g-pal-${n + lead}`} role="option" aria-selected={n + lead === cur} className={n + lead === cur ? 'on' : ''} onMouseMove={() => setAt(n + lead)} onClick={() => go(n + lead)}>
              <span className="g-pal-kind">{copy.kinds[it.kind]}</span>
              <span className="g-pal-label" title={it.label}>{it.label}</span>
              <span className="g-pal-n">{copy.visitorsN(fmtInt(it.visitors))}</span>
            </li>
          ))}
          {!found.length && q.trim() && <li className="g-pal-empty" role="presentation">{copy.findEmpty}</li>}
        </ul>
      </div>
    </div>
  )
}
