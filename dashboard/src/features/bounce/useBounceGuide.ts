// The bounce guide of one site and period, asked once for each; `qs` is null
// until it is wanted. A failed read is "failed", never a guess.
import { useEffect, useState } from 'react'
import { call } from '../../lib/api'
import type { BounceGuide } from '../../lib/apiMore'

export type GuideState = 'loading' | 'ready' | 'failed'

export function useBounceGuide(site: string, qs: string | null): { guide: BounceGuide | null; state: GuideState } {
  const [got, setGot] = useState<{ key: string; guide: BounceGuide | null } | null>(null)
  const key = qs === null ? '' : site + qs
  useEffect(() => {
    if (qs === null) return
    const ctl = new AbortController()
    // qs: rangeQS(query), or "?days=30" for the last days (All sites). Quiet: a share page may not ask.
    call<BounceGuide>('GET', `/sites/${site}/report/bounce-guide${qs}`, undefined, ctl.signal, true)
      .then((guide) => setGot({ key, guide }))
      .catch(() => !ctl.signal.aborted && setGot({ key, guide: null }))
    return () => ctl.abort()
  }, [site, qs, key])
  if (qs === null || got?.key !== key) return { guide: null, state: 'loading' }
  return got.guide ? { guide: got.guide, state: 'ready' } : { guide: null, state: 'failed' }
}
