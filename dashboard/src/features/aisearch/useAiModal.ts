// What the guide card's dialog shows, from endpoints the dashboard already has: the AI & Search
// report for the period, and the period's visitors from AI day by day.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { more, type AiSearchReport } from '../../lib/apiMore'
import type { Period } from '../../components/CardModal/period'

export interface AiModalData {
  rep: AiSearchReport
  /** Visitors from AI for each bucket of the period. */
  series: number[]
}

/** `undefined` while it loads, `null` when it could not be read. */
export function useAiModal(site: string, period: Period): AiModalData | null | undefined {
  const [got, setGot] = useState<AiModalData | null | undefined>(undefined)
  useEffect(() => {
    const ctl = new AbortController()
    const q = period.query
    Promise.all([more.aiSearch(site, q, 6, ctl.signal), api.report(site, { ...q, filters: [{ dim: 'channel', value: 'AI' }] }, ctl.signal).catch(() => null)])
      .then(([rep, report]) => setGot({ rep, series: report?.current.series.map((p) => p.visitors) ?? [] }))
      .catch(() => !ctl.signal.aborted && setGot(null))
    return () => ctl.abort()
  }, [site, period])
  return got
}
