// What Answers shows before there is anything to read: no AI key, no questions, and the first round on its way.
import { XEmpty } from '../../v2/ui/XBits'
import { openSettings } from '../../lib/settings'
import { can } from '../../lib/permissions'
import type { Site } from '../../lib/api'
import { answersCopy as c } from './copy'

export function NoEngine() {
  return <XEmpty title={c.empty.noEngine[0]} hint={c.empty.noEngine[1]} />
}

export function NoQuestions({ site }: { site: Site }) {
  const [title, hint] = c.empty.noQuestions
  return (
    <XEmpty title={title} hint={hint}>
      {can('answers.manage') && (
        <button type="button" className="xb" onClick={() => openSettings(site, 'answers')}>
          {c.empty.addQuestions}
        </button>
      )}
    </XEmpty>
  )
}

export function FirstRound({ progress }: { progress?: { done: number; total: number } }) {
  const [title, hint] = c.empty.firstRound
  return (
    <XEmpty title={title} hint={hint}>
      {progress && progress.total > 0 && (
        <>
          <span className="an-prog" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={c.partial(progress.done, progress.total)}>
            <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </span>
          <span className="an-note">{c.partial(progress.done, progress.total)}</span>
        </>
      )}
    </XEmpty>
  )
}
