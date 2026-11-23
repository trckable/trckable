// Where the card goes: LinkedIn and X up front, the other places under "More places" (a picked one takes the label's place), and one line that says what will happen.
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { MAIN_PLACES, MORE_PLACES, type Place } from './places'
import { copy } from './copy'

const GLYPH: Record<Place, string> = { linkedin: 'in', x: '𝕏', instagram: 'ig', threads: '@', facebook: 'f', bluesky: 'b', download: '↓', email: '✉' }

function Row({ id, on, onPick }: { id: Place; on: boolean; onPick: (p: Place) => void }) {
  return (
    <button type="button" className="sd-place" aria-pressed={on} onClick={() => onPick(id)}>
      <span className="sd-glyph" aria-hidden="true">
        {GLYPH[id]}
      </span>
      <span className="sd-place-name">{copy.places[id]}</span>
    </button>
  )
}

export function ShareTo({ place, onPick }: { place: Place; onPick: (p: Place) => void }) {
  const [more, setMore] = useState(false)
  const picked = MORE_PLACES.find((p) => p.id === place)
  const pick = (p: Place) => {
    setMore(false)
    onPick(p)
  }
  return (
    <section className="sd-shareto" aria-label={copy.shareTo}>
      <h3 className="sd-cap">{copy.shareTo}</h3>
      {MAIN_PLACES.map((p) => (
        <Row key={p.id} id={p.id} on={p.id === place} onPick={pick} />
      ))}
      <button type="button" className="sd-place sd-more" aria-expanded={more} aria-pressed={!!picked} onClick={() => setMore((m) => !m)}>
        <span className="sd-glyph" aria-hidden="true">
          {picked ? GLYPH[picked.id] : '⋯'}
        </span>
        <span className="sd-place-name">{picked ? copy.places[picked.id] : copy.morePlaces}</span>
        <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {more && (
        <div className="sd-morelist">
          {MORE_PLACES.map((p) => (
            <Row key={p.id} id={p.id} on={p.id === place} onPick={pick} />
          ))}
        </div>
      )}
      <p className="sd-note faint">{copy.placeNote[place]}</p>
    </section>
  )
}
