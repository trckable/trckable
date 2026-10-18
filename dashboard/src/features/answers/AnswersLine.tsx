// The one-line summary in AI & search: the seen line and the way to the Answers section, or the way to add questions.
import { XEmpty, XSec } from '../../v2/ui/XBits'
import type { XCtx } from '../../v2/explore/ctx'
import { openSettings } from '../../lib/settings'
import { can } from '../../lib/permissions'
import { answersCopy as c } from './copy'
import { phaseOf } from './derive'
import { useAnswers } from './useAnswers'
import { GhostMark } from './GhostMark'
import './answers.css'

export function AnswersLine({ x }: { x: XCtx }) {
  const { rep } = useAnswers(x.site.id, x.query)
  if (!rep) return null
  const phase = phaseOf(rep)
  if (phase === 'noengine') return null
  if (phase === 'noquestions') {
    return (
      <>
        <XSec a={c.line.ai} />
        <XEmpty title={c.line.noQuestions[0]} hint={c.line.noQuestions[1]}>
          {can('answers.manage') && (
            <button type="button" className="xb" onClick={() => openSettings(x.site, 'answers')}>
              {c.line.add}
            </button>
          )}
        </XEmpty>
      </>
    )
  }
  const now = rep.latest
  return (
    <>
      <XSec a={c.line.ai} />
      <button type="button" className="an an-line" onClick={() => x.goTo('answers')}>
        <GhostMark state="both" size={18} />
        {now ? <span>{c.seen(now.seen, now.total)}</span> : <span>{c.empty.firstRound[0]}</span>}
        {now && rep.was && <small>{c.seenWas(rep.was.seen, rep.was.total)}</small>}
        <i>{c.line.more} {'›'}</i>
      </button>
    </>
  )
}
