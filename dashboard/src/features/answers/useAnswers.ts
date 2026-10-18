// The Answers numbers for a site: one read, again on request. While the first round is being asked, it is read again every 30 seconds.
import { useCallback, useEffect, useState } from 'react'
import type { ReportQuery } from '../../lib/api'
import { answersApi, type AnswersReport } from './api'

/** `undefined` while it loads, `null` when it could not be read. */
export function useAnswers(site: string, query: ReportQuery) {
  const [again, setAgain] = useState(0)
  const [got, setGot] = useState<{ key: string; rep: AnswersReport | null } | null>(null)
  const key = JSON.stringify([site, query.from, query.to, again])
  useEffect(() => {
    const ac = new AbortController()
    answersApi
      .report(site, query, ac.signal)
      .then((rep) => setGot({ key, rep }))
      .catch(() => !ac.signal.aborted && setGot({ key, rep: null }))
    return () => ac.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- key is the request's content
  const rep = got?.key === key ? got.rep : undefined
  const asking = rep?.state === 'first'
  useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => setAgain((n) => n + 1), 30_000)
    return () => clearTimeout(t)
  }, [asking, again])
  const reload = useCallback(() => setAgain((n) => n + 1), [])
  return { rep, reload }
}
