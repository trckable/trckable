// One question, opened: for each assistant the answer as plain text with the sentence that names the site marked, the
// pages it linked, who it named instead, and the last six rounds.
import { useRef } from 'react'
import { MkPortal } from '../../v2/ui/Portal'
import { useSheet } from '../../v2/ui/useSheet'
import { answersCopy as c } from './copy'
import { ENGINES, type Engine, type QuestionRounds, type Run } from './api'
import { cellState } from './derive'
import { GhostMark } from './GhostMark'
import { useQuestion } from './useQuestion'
import { dayOf, where } from './when'

type Round = QuestionRounds['rounds'][number]

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

/** What a set of runs showed, as the counts the table uses. */
const tally = (runs: Run[]) => {
  const ok = runs.filter((r) => r.ok)
  return { seen: ok.filter((r) => r.named || r.cited).length, runs: ok.length, named: ok.filter((r) => r.named).length, cited: ok.filter((r) => r.cited).length, position: 0 }
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function RunBlock({ r, many, domain }: { r: Run; many: boolean; domain: string }) {
  const links = [...r.citations, ...r.sources.filter((s) => !r.citations.some((x) => x.url === s.url))]
  const mine = (u: string) => !!domain && (hostOf(u) === domain || hostOf(u).endsWith('.' + domain))
  return (
    <div className="an-run-one">
      {many && <small className="an-runno">{c.sheet.run(r.run)}</small>}
      {!r.ok ? <p className="an-why">{c.sheet.errored}</p> : r.text ? <Said text={r.text} hit={r.sentence} /> : <p className="an-why">{c.sheet.gone}</p>}
      {r.ok && (
        <dl>
          <dt>{c.sheet.linked}</dt>
          <dd>
            {links.length === 0 ? (
              <span className="mute">{c.sheet.noLinks}</span>
            ) : (
              <ul>
                {links.map((l) => (
                  <li key={l.url} className={mine(l.url) ? 'mine' : ''}>
                    {l.url.replace(/^https?:\/\//, '')}
                  </li>
                ))}
              </ul>
            )}
          </dd>
          <dt>{c.instead}</dt>
          <dd>{r.rivals.length ? r.rivals.map((x) => x.name).join(', ') : <span className="mute">{c.none}</span>}</dd>
        </dl>
      )}
    </div>
  )
}

function EngineBlock({ engine, rounds, domain }: { engine: Engine; rounds: Round[]; domain: string }) {
  const runs = rounds[0]?.engines[engine] ?? []
  const state = cellState(tally(runs))
  const t = tally(runs)
  const past = rounds.slice().reverse()
  return (
    <section className="an-eng" aria-label={c.engine[engine]}>
      <header>
        <GhostMark state={state} size={24} label={c.state[state]} />
        <span className="who">
          <b>{c.engine[engine]}</b>
          <span>{c.state[state]}</span>
        </span>
        <span className="runs">{c.runs(t.seen, t.runs)}</span>
      </header>
      {state !== 'both' && <p className="an-why">{c.stateWhy[state]}</p>}
      {runs.map((r) => (
        <RunBlock key={r.run} r={r} many={runs.length > 1} domain={domain} />
      ))}
      <dl>
        <dt>{c.sheet.rounds}</dt>
        <dd>
          <span className="an-hist">
            {past.map((rd, i) => {
              const s = cellState(tally(rd.engines[engine] ?? []))
              const when = dayOf(rd.round)
              return (
                <span key={rd.round}>
                  <GhostMark state={s} size={18} label={`${when}: ${c.state[s]}`} />
                  <small>{i === past.length - 1 ? c.sheet.now : when}</small>
                </span>
              )
            })}
          </span>
        </dd>
      </dl>
    </section>
  )
}

export function AnswerSheet({ site, domain, id, text, engines, country, onClose }: { site: string; domain: string; id: number; text: string; engines: Engine[]; country?: string; onClose: () => void }) {
  const box = useRef<HTMLElement>(null)
  useSheet(box, onClose)
  const q = useQuestion(site, id)
  return (
    <MkPortal>
      <div className="xscrim on" onClick={onClose} aria-hidden="true" />
      <aside ref={box} className="cd on an-drawer" aria-label={text} tabIndex={-1}>
        <div className="cdh">
          <b>{c.section[0]}</b>
          {country && <span className="mk-quiet">{c.from(where(country))}</span>}
          <button type="button" className="ib x" title={c.sheet.close} aria-label={c.sheet.close} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="cdb an-sheet">
          <h2>{text}</h2>
          {q === undefined && <p className="an-why">{c.sheet.loading}</p>}
          {q === null && <p className="an-warn">{c.sheet.failed}</p>}
          {q && ENGINES.filter((e) => engines.includes(e)).map((e) => <EngineBlock key={e} engine={e} rounds={q.rounds} domain={domain} />)}
          <p className="an-honest">{c.honest}</p>
        </div>
      </aside>
    </MkPortal>
  )
}
