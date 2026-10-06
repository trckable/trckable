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
  onPick: (p: Pick) => void
  onClose: () => void
}

export function Palette({ items, opener, onPick, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const found = useMemo(() => search(items, q), [items, q])
  const cur = Math.min(at, Math.max(0, found.length - 1))
  useSheet(box, onClose, opener)
  const go = (it: Item | undefined) => it && onPick(pickOf(it))
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAt((cur + 1) % Math.max(1, found.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAt((cur - 1 + found.length) % Math.max(1, found.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(found[cur])
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
          aria-activedescendant={found.length ? `g-pal-${cur}` : undefined}
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
          {found.map((it, n) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- the options are driven by the combobox input's keys
            <li key={it.kind + it.key} id={`g-pal-${n}`} role="option" aria-selected={n === cur} className={n === cur ? 'on' : ''} onMouseMove={() => setAt(n)} onClick={() => go(it)}>
              <span className="g-pal-kind">{copy.kinds[it.kind]}</span>
              <span className="g-pal-label" title={it.label}>{it.label}</span>
              <span className="g-pal-n">{copy.visitorsN(fmtInt(it.visitors))}</span>
            </li>
          ))}
          {!found.length && <li className="g-pal-empty" role="presentation">{copy.findEmpty}</li>}
        </ul>
      </div>
    </div>
  )
}
