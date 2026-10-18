// The one-line summary in AI & search: the seen line and the way to the Answers section, or the way to add questions.
import { XEmpty, XSec } from '../../v2/ui/XBits'
import type { XCtx } from '../../v2/explore/ctx'
import { openSettings } from '../../lib/settings'
import { canChange } from '../../lib/me'
import { answersCopy as c } from './copy'
import { useAnswers } from './useAnswers'
import { GhostMark } from './GhostMark'
import './answers.css'

export function AnswersLine({ x }: { x: XCtx }) {
  const { rep } = useAnswers(x.site.id, x.query)
  if (!rep || rep.state === 'noengine') return null
  if (rep.state === 'noquestions') {
    return (
      <>
        <XSec a={c.line.ai} />
        <XEmpty title={c.line.noQuestions[0]} hint={c.line.noQuestions[1]}>
          {canChange() && (
            <button type="button" className="xb" onClick={() => openSettings(x.site, 'answers')}>
              {c.line.add}
            </button>
          )}
        </XEmpty>
      </>
    )
  }
  return (
    <>
      <XSec a={c.line.ai} />
      <button type="button" className="an an-line" onClick={() => x.goTo('answers')}>
        <GhostMark state="both" size={18} />
        <span>{c.seen(rep.seen.n, rep.seen.total)}</span>
        {rep.was && <small>{c.seenWas(rep.was.n, rep.was.total)}</small>}
        <i>{c.line.more} {'›'}</i>
      </button>
    </>
  )
}
