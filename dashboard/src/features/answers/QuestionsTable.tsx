// The questions: one row each, one ghost per assistant with its state in words, and who was named instead.
import { XSec } from '../../v2/ui/XBits'
import { answersCopy as c } from './copy'
import { ENGINES, type AnswersReport, type Question } from './api'
import { GhostMark } from './GhostMark'

export function QuestionsTable({ rep, onOpen }: { rep: AnswersReport; onOpen: (q: Question) => void }) {
  return (
    <div>
      <XSec a={c.questions} />
      <div className="an-qt">
        <div className="an-qh">
          <span>{c.question}</span>
          <span className="eng">
            {ENGINES.filter((e) => rep.engines.includes(e)).map((e) => (
              <span key={e}>{c.engine[e]}</span>
            ))}
          </span>
          <span>{c.instead}</span>
        </div>
        {rep.questions.map((q) => (
          <button key={q.id} type="button" className="an-qr" onClick={() => onOpen(q)}>
            <span className="q">
              <b>{q.text}</b>
            </span>
            <span className="marks">
              {ENGINES.filter((e) => rep.engines.includes(e)).map((e) => {
                const r = q.engines[e]
                return (
                  <span key={e}>
                    <GhostMark state={r.state} size={20} asking={r.pending} label={`${c.engine[e]}: ${c.state[r.state]}`} />
                    <small>{r.pending ? c.asking : c.state[r.state]}</small>
                  </span>
                )
              })}
            </span>
            <span className="inst">{q.engines.openai.pending ? <i>{c.empty.pending}</i> : q.instead.join(', ') || <i>{c.none}</i>}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
