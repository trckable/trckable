// Explore → Site → Answers: whether the AI assistants name or link the site for the questions its buyers ask, who they name
// instead, and what the pages they link to were worth.
import { useState } from 'react'
import { Loading } from '../../components/loading/Loading'
import { XError } from '../../v2/ui/XBits'
import type { XCtx } from '../../v2/explore/ctx'
import { answersCopy as c } from './copy'
import type { Question } from './api'
import { useAnswers } from './useAnswers'
import { AnswerSheet } from './AnswerSheet'
import { AnswersEmpty, FirstRound } from './Empties'
import { AnswersPages } from './AnswersPages'
import { Peekaboo } from './Peekaboo'
import { QuestionsTable } from './QuestionsTable'
import { Rivals } from './Rivals'
import { Summary } from './Summary'
import './answers.css'

export default function AnswersTab({ x }: { x: XCtx }) {
  const { rep, reload } = useAnswers(x.site.id, x.query)
  const [open, setOpen] = useState<Question | null>(null)
  if (rep === undefined) return <Loading height={180} />
  if (rep === null) return <XError title={c.failed} onRetry={reload} />
  if (rep.state === 'noengine') return <AnswersEmpty kind="noEngine" site={x.site} />
  if (rep.state === 'noquestions') return <AnswersEmpty kind="noQuestions" site={x.site} />
  const who = rep.first
  const first = who ? rep.questions.find((q) => q.engines[who].state !== 'none') : undefined
  return (
    <div className="an">
      {who && first && <Peekaboo engine={who} onOpen={() => setOpen(first)} />}
      {rep.state === 'first' && <FirstRound rep={rep} />}
      <Summary rep={rep} />
      <Rivals rivals={rep.rivals} />
      <QuestionsTable rep={rep} onOpen={setOpen} />
      <AnswersPages rows={rep.pages} money={x.money} onPick={(p) => x.pick('page', p)} />
      {open && <AnswerSheet q={open} rep={rep} onClose={() => setOpen(null)} />}
    </div>
  )
}
