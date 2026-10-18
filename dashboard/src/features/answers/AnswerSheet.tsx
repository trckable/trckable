// One question, opened: for each assistant the answer as plain text with the sentence that names the site marked, the
// pages it linked, who it named instead, and the last six rounds.
import { Fragment } from 'react'
import { useRef } from 'react'
import { MkPortal } from '../../v2/ui/Portal'
import { useSheet } from '../../v2/ui/useSheet'
import { answersCopy as c } from './copy'
import { ENGINES, type AnswersReport, type Engine, type EngineResult, type Question } from './api'
import { GhostMark } from './GhostMark'

/** The answer, with the naming sentence marked. Plain text: nothing from an answer is ever read as HTML. */
function Said({ text, hit }: { text: string; hit: string }) {
  const at = hit ? text.indexOf(hit) : -1
  if (at < 0) return <p className="an-said">{text}</p>
  return (
    <p className="an-said">
      {text.slice(0, at)}
      <mark>{hit}</mark>
      {text.slice(at + hit.length)}
    </p>
  )
}

function EngineBlock({ engine, r, rounds }: { engine: Engine; r: EngineResult; rounds: AnswersReport['rounds'] }) {
  const mine = (u: string) => u.includes('trckable.com')
  return (
    <section className="an-eng" aria-label={c.engine[engine]}>
      <header>
        <GhostMark state={r.state} size={24} label={c.state[r.state]} />
        <span className="who">
          <b>{c.engine[engine]}</b>
          <span>{c.state[r.state]}</span>
        </span>
        <span className="runs">{c.runs(r.runs[0], r.runs[1])}</span>
      </header>
      {r.state !== 'both' && <p className="an-why">{c.stateWhy[r.state]}</p>}
      <Said text={r.text} hit={r.hit} />
      <dl>
        <dt>{c.sheet.linked}</dt>
        <dd>
          {r.links.length === 0 ? (
            <span className="mute">{c.sheet.noLinks}</span>
          ) : (
            <ul>
              {r.links.map((u) => (
                <li key={u} className={mine(u) ? 'mine' : ''}>
                  {u.replace('https://', '')}
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>{c.instead}</dt>
        <dd>{r.instead.length ? r.instead.join(', ') : <span className="mute">{c.none}</span>}</dd>
        <dt>{c.sheet.rounds}</dt>
        <dd>
          <span className="an-hist">
            {r.history.map((s, i) => (
              <Fragment key={i}>
                <span>
                  <GhostMark state={s} size={18} label={`${rounds[rounds.length - r.history.length + i]?.at ?? ''}: ${c.state[s]}`} />
                  <small>{i === r.history.length - 1 ? c.sheet.now : rounds[rounds.length - r.history.length + i]?.at}</small>
                </span>
              </Fragment>
            ))}
          </span>
        </dd>
      </dl>
    </section>
  )
}

export function AnswerSheet({ q, rep, onClose }: { q: Question; rep: AnswersReport; onClose: () => void }) {
  const box = useRef<HTMLElement>(null)
  useSheet(box, onClose)
  return (
    <MkPortal>
      <div className="xscrim on" onClick={onClose} aria-hidden="true" />
      <aside ref={box} className="cd on an-drawer" aria-label={q.text} tabIndex={-1}>
        <div className="cdh">
          <b>{c.section[0]}</b>
          <span className="mk-quiet">{c.from(c.countries[rep.country] ?? rep.country)}</span>
          <button type="button" className="ib x" title={c.sheet.close} aria-label={c.sheet.close} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="cdb an-sheet">
          <h2>{q.text}</h2>
          {ENGINES.filter((e) => rep.engines.includes(e) && !q.engines[e].pending).map((e) => (
            <EngineBlock key={e} engine={e} r={q.engines[e]} rounds={rep.rounds} />
          ))}
          <p className="an-honest">{c.honest}</p>
        </div>
      </aside>
    </MkPortal>
  )
}
