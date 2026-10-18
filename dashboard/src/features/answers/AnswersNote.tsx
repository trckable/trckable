// The Briefing's one line about Answers: an assistant started or stopped naming the site lately. It opens the Answers screen.
import { useEffect, useState } from 'react'
import { Act } from '../../v2/ui/ConnectPlaceholder'
import { openExplore } from '../../v2/explore/open'
import type { Range } from '../../lib/dates'
import type { Site } from '../../lib/api'
import { answersCopy as c } from './copy'
import { answersApi, type Change } from './api'

const LATELY = 7 * 86400

export default function AnswersNote({ site, range }: { site: Site; range: Range }) {
  const [change, setChange] = useState<Change | null>(null)
  useEffect(() => {
    const ac = new AbortController()
    answersApi
      .report(site.id, { from: range.from, to: range.to }, ac.signal)
      .then((rep) => setChange((rep.changes ?? []).find((x) => Date.now() / 1000 - x.at < LATELY) ?? null))
      .catch(() => setChange(null))
    return () => ac.abort()
  }, [site.id, range.from, range.to])
  if (!change) return null
  const words = c.change[change.kind](c.engine[change.engine], change.question)
  return <Act text={words} label={c.change.open} onAct={() => openExplore('answers')} />
}
