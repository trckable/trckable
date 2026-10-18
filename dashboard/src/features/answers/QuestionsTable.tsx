// The questions: one row each, one ghost per assistant with its state in words, and who was named instead.
import { XSec } from '../../v2/ui/XBits'
import { answersCopy as c } from './copy'
import type { AnswersReport, Row } from './api'
import { cellState, enginesOf } from './derive'
import { GhostMark } from './GhostMark'

export function QuestionsTable({ rep, onOpen }: { rep: AnswersReport; onOpen: (q: Row) => void }) {
  const engines = enginesOf(rep)
  const done = !!rep.latest?.complete
  return (
    <div>
      <XSec a={c.questions} />
      <div className="an-qt">
        <div className="an-qh">
          <span>{c.question}</span>
          <span className="eng">
            {engines.map((e) => (
              <span key={e}>{c.engine[e]}</span>
            ))}
          </span>
          <span>{c.instead}</span>
        </div>
        {(rep.questions ?? []).map((q) => (
          <button key={q.id} type="button" className={`an-qr${q.active ? '' : ' off'}`} onClick={() => onOpen(q)}>
            <span className="q">
              <b>{q.text}</b>
              {!q.active && <small>{c.off}</small>}
            </span>
            <span className="marks">
              {engines.map((e) => {
                const cell = q.engines[e]
                const asking = q.active && !done && !cell?.runs
                const state = cellState(cell)
                return (
                  <span key={e}>
                    <GhostMark state={state} size={20} asking={asking} label={`${c.engine[e]}: ${c.state[state]}`} />
                    <small>{asking ? c.asking : c.state[state]}</small>
                  </span>
                )
              })}
            </span>
            <span className="inst">{q.instead.length ? q.instead.join(', ') : <i>{c.none}</i>}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
