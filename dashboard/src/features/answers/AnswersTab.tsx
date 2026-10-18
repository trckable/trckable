// Explore → Site → Answers: whether the AI assistants name or link the site for the questions its buyers ask, who they name
// instead, and what the pages they link to were worth.
import { useState } from 'react'
import { Loading } from '../../components/loading/Loading'
import { XError } from '../../v2/ui/XBits'
import type { XCtx } from '../../v2/explore/ctx'
import { answersCopy as c } from './copy'
import type { Row } from './api'
import { enginesOf, firstEver, phaseOf } from './derive'
import { useAnswers } from './useAnswers'
import { AnswerSheet } from './AnswerSheet'
import { FirstRound, NoEngine, NoQuestions } from './Empties'
import { AnswersPages } from './AnswersPages'
import { Peekaboo } from './Peekaboo'
import { QuestionsTable } from './QuestionsTable'
import { Rivals } from './Rivals'
import { Summary } from './Summary'
import './answers.css'

export default function AnswersTab({ x }: { x: XCtx }) {
  const { rep, setup, reload } = useAnswers(x.site.id, x.query)
  const [open, setOpen] = useState<Row | null>(null)
  if (rep === undefined) return <Loading height={180} />
  if (rep === null) return <XError title={c.failed} onRetry={reload} />
  const phase = phaseOf(rep)
  if (phase === 'noengine') return <NoEngine />
  if (phase === 'noquestions') return <NoQuestions site={x.site} />
  const first = firstEver(rep, Math.floor(Date.now() / 1000))
  const named = first && (rep.questions ?? []).find((q) => q.id === first.question_id)
  return (
    <div className="an">
      {first && named && <Peekaboo engine={first.engine} onOpen={() => setOpen(named)} />}
      {phase === 'first' && <FirstRound progress={setup?.round} />}
      {phase === 'ok' && <Summary rep={rep} progress={rep.latest?.complete === false ? setup?.round : undefined} />}
      {phase === 'ok' && rep.latest && (rep.rivals ?? []).length > 0 && <Rivals you={rep.latest.seen} rivals={rep.rivals ?? []} />}
      <QuestionsTable rep={rep} onOpen={setOpen} />
      <AnswersPages rows={rep.pages ?? []} money={x.money} onPick={(p) => x.pick('page', p)} />
      {open && <AnswerSheet site={x.site.id} domain={x.site.domain} id={open.id} text={open.text} engines={enginesOf(rep)} country={rep.country} onClose={() => setOpen(null)} />}
    </div>
  )
}
