// The Answers numbers for a site: one read, again on request. While a round is being asked, the report and how far it
// is are read again every 30 seconds, for up to half an hour, so results show as they land.
import { useCallback, useEffect, useState } from 'react'
import type { ReportQuery } from '../../lib/api'
import { answersApi, type AnswersReport, type AnswersSetup } from './api'
import { phaseOf } from './derive'

const EVERY = 30_000
const FOR = 30 * 60_000

/** `rep` is `undefined` while it loads and `null` when it could not be read. */
export function useAnswers(site: string, query: ReportQuery) {
  const [again, setAgain] = useState(0)
  const [since] = useState(() => Date.now())
  const [got, setGot] = useState<{ key: string; rep: AnswersReport | null; setup?: AnswersSetup } | null>(null)
  const key = JSON.stringify([site, query.from, query.to, again])
  useEffect(() => {
    const ac = new AbortController()
    const asked = answersApi.report(site, query, ac.signal)
    asked
      .then(async (rep) => {
        const asking = rep.engines.length > 0 && (phaseOf(rep) === 'first' || rep.latest?.complete === false)
        const setup = asking ? await answersApi.setup(site, ac.signal).catch(() => undefined) : undefined
        setGot({ key, rep, setup })
      })
      .catch(() => !ac.signal.aborted && setGot({ key, rep: null }))
    return () => ac.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- key is the request's content; query is a new object each render
  const here = got?.key === key ? got : undefined
  const asking = !!here?.setup
  useEffect(() => {
    if (!asking || Date.now() - since > FOR) return
    const t = setTimeout(() => setAgain((n) => n + 1), EVERY)
    return () => clearTimeout(t)
  }, [asking, again, since])
  const reload = useCallback(() => setAgain((n) => n + 1), [])
  return { rep: here ? here.rep : undefined, setup: here?.setup, reload }
}
