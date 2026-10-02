// The other moments that landed beside the open one, under its figure: at most
// three rows, the milestones together in one ("4 milestones", the list on tap),
// "+N more" for the rest, opened in place. The list scrolls inside the card
// (moments.css), so the card never grows past the screen.
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { copy } from './copy'
import { rowsOf, visibleRows, type Item } from './cluster'
import type { Pin } from './pins'
import { say } from './words'

export function ClusterList({ pins, at, money, onPick }: { pins: Pin[]; at: number; money: (minor: number) => string; onPick: (k: number) => void }) {
  const [all, setAll] = useState(false)
  const [miles, setMiles] = useState(false)
  const rows = rowsOf(pins, at)
  if (rows.length === 0) return null
  const { shown, hidden } = visibleRows(rows, all)
  const pick = (i: Item) => (
    <li key={i.pin.id}>
      <button type="button" onClick={() => onPick(i.k)}>
        {say(i.pin, money).line}
      </button>
    </li>
  )
  return (
    <ul className="why-more">
      {shown.map((r) =>
        r.group ? (
          <li key="milestones" className="why-group">
            <button type="button" aria-expanded={miles} onClick={() => setMiles(!miles)}>
              {copy.milestones(r.items.length)}
              <ChevronDown size={14} aria-hidden="true" className={miles ? 'open' : undefined} />
            </button>
            {miles && <ul>{r.items.map(pick)}</ul>}
          </li>
        ) : (
          pick(r.item)
        ),
      )}
      {hidden > 0 && (
        <li>
          <button type="button" className="why-all" onClick={() => setAll(true)}>
            {copy.more(hidden)}
          </button>
        </li>
      )}
    </ul>
  )
}
