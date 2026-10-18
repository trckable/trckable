// The one playful moment: the first time an assistant has named the site, the ghost looks up over the edge of the card.
import { Ghost } from '../../components/Logo'
import { answersCopy as c } from './copy'
import type { Engine } from './api'

const SPARKS = [0, 1, 2, 3, 4]

export function Peekaboo({ engine, onOpen }: { engine: Engine; onOpen: () => void }) {
  return (
    <div className="an-peek" role="status">
      <div className="an-peek-stage" aria-hidden="true">
        <span className="an-peek-glow" />
        <span className="an-peek-ghost">
          <Ghost size={58} />
        </span>
        {SPARKS.map((i) => (
          <i key={i} className={`an-spk s${i}`} />
        ))}
      </div>
      <div className="an-peek-text">
        <b>{c.first(c.engine[engine])}</b>
        <span>{c.firstHint}</span>
      </div>
      <button type="button" className="an-btn small" onClick={onOpen}>
        {c.firstOpen}
      </button>
    </div>
  )
}
