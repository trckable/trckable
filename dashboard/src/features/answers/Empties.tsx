// What Answers shows before there is anything to read: no AI key, no questions, and the first round on its way.
import { openSettings } from '../../lib/settings'
import type { Site } from '../../lib/api'
import { canChange } from '../../lib/me'
import { Ghost } from '../../components/Logo'
import { answersCopy as c } from './copy'
import { GhostMark } from './GhostMark'
import type { AnswersReport } from './api'

export function AnswersEmpty({ kind, site }: { kind: 'noEngine' | 'noQuestions'; site: Site }) {
  const [title, hint] = c.empty[kind]
  return (
    <div className="an an-empty">
      <GhostMark state="none" size={44} />
      <b>{title}</b>
      <span className="t">{hint}</span>
      {kind === 'noQuestions' && canChange() && (
        <button type="button" className="an-btn primary" onClick={() => openSettings(site, 'answers')}>
          {c.empty.addQuestions}
        </button>
      )}
    </div>
  )
}

export function FirstRound({ rep }: { rep: AnswersReport }) {
  const [title, hint] = c.empty.firstRound
  const p = rep.partial
  return (
    <div className="an-empty">
      <Ghost size={52} peek />
      <b>{title}</b>
      <span className="t">{hint}</span>
      {p && (
        <>
          <span className="an-prog" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done} aria-label={c.partial(p.done, p.total)}>
            <i style={{ width: `${(p.done / p.total) * 100}%` }} />
          </span>
          <span className="an-note">{c.partial(p.done, p.total)}</span>
        </>
      )}
    </div>
  )
}
