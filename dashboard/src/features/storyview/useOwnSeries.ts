// The daily visitors behind the two answers that are about one page or one
// channel: "Which page carries you?" and "What needs fixing?". The server's
// per-row series (server/internal/query/sparks.go) answers both in one scan
// each, over the Story's own range, with the same permissions as the report.
import { useEffect, useState } from 'react'
import { call, rangeQS, type ReportQuery } from '../../lib/api'
import type { Answer } from './rules'

type Key = Answer['key']

/** Which dimension each of the two answers is about. */
const DIM: Partial<Record<Key, string>> = { page: 'entry_page', fix: 'channel' }

/** The value an answer is about, read from the filter its link opens Explore with. */
export function subjectOf(a: Answer): { dim: string; value: string } | undefined {
  const dim = DIM[a.key]
  const f = a.act?.filters.find((x) => x.dim === dim)
  return dim && f && typeof f.value === 'string' ? { dim, value: f.value } : undefined
}

/** One answer's own daily visitors for the range; absent until it arrives, or when the server cannot tell (a range over 92 days). */
export function useOwnSeries(site: string, q: ReportQuery, answers: Answer[]): Partial<Record<Key, number[]>> {
  const wanted = answers.flatMap((a) => {
    const s = subjectOf(a)
    return s ? [{ key: a.key, ...s }] : []
  })
  const filters = q.filters
  const asked = JSON.stringify([site, q.from, q.to, filters ?? [], wanted])
  // What arrived, and for which question: an answer to an older question is never shown.
  const [got, setGot] = useState<{ asked: string; rows: Partial<Record<Key, number[]>> }>({ asked: '', rows: {} })
  useEffect(() => {
    let live = true
    for (const w of wanted) {
      const qs = rangeQS({ from: q.from, to: q.to, filters }) + '&dim=' + encodeURIComponent(w.dim) + '&v=' + encodeURIComponent(w.value)
      call<{ rows: Record<string, number[]> }>('GET', `/sites/${encodeURIComponent(site)}/sparks` + qs, undefined, undefined, true)
        .then((r) => {
          const days = r.rows[w.value]
          if (live && days) setGot((g) => ({ asked, rows: { ...(g.asked === asked ? g.rows : {}), [w.key]: days } }))
        })
        .catch(() => undefined)
    }
    return () => {
      live = false
    }
  }, [asked]) // eslint-disable-line react-hooks/exhaustive-deps -- `asked` is every input, by content
  return got.asked === asked ? got.rows : {}
}
