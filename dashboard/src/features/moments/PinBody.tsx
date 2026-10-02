// A pin's figure and what stands behind it: the body of the card a marker
// opens and of the card on opening.
import type { Said } from './words'

export function PinBody({ said, kind }: { said: Said; kind?: boolean }) {
  return (
    <>
      {kind && <span className="why-kind muted">{said.title}</span>}
      <b className="why-big num">{said.big}</b>
      <p className="why-facts muted">
        {said.facts.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </p>
    </>
  )
}
