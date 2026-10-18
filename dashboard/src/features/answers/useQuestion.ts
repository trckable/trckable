// One question's last six rounds, read when its sheet opens.
import { useEffect, useState } from 'react'
import { answersApi, type QuestionRounds } from './api'

/** `undefined` while it loads, `null` when it could not be read. */
export function useQuestion(site: string, id: number) {
  const [got, setGot] = useState<{ id: number; q: QuestionRounds | null } | null>(null)
  useEffect(() => {
    const ac = new AbortController()
    answersApi
      .question(site, id, ac.signal)
      .then((q) => setGot({ id, q }))
      .catch(() => !ac.signal.aborted && setGot({ id, q: null }))
    return () => ac.abort()
  }, [site, id])
  return got?.id === id ? got.q : undefined
}
