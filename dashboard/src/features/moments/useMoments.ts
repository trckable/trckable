// The pins of the period on screen: the server's moments (spikes, sales, an AI
// assistant's first visit, milestones) and the findings that have a day (a new
// referrer, a page whose buyers fell away), whatever the page is filtered to (api.ts). Asked for once the page is quiet,
// so they never take a slot among the requests the first load needs; a failure
// is no pins, never an error: markers are garnish.
import { useEffect, useState } from 'react'
import type { Bucket, ReportQuery } from '../../lib/api'
import { extrasApi } from '../extras/extrasApi'
import { whenQuiet } from '../extras/quiet'
import { momentsApi } from './api'
import { dedupePins, pinsFromInsights, pinsFromMoments, type Pin } from './pins'

/** Moments come by the day, or by the hour for an hourly chart; a week or a month holds the days it is made of. */
export const momentBucket = (chart: Bucket): 'day' | 'hour' => (chart === 'hour' ? 'hour' : 'day')

export function useMoments(site: string, query: ReportQuery, bucket: Bucket): Pin[] | null {
  const [found, setFound] = useState<{ key: string; pins: Pin[] } | null>(null)
  const which = momentBucket(bucket)
  const key = [site, query.from, query.to, which, query.testPayments ? 'test' : '', query.attr ?? ''].join('|')
  useEffect(() => {
    const ctl = new AbortController()
    const cancel = whenQuiet(() => {
      const none = (): Pin[] => []
      void Promise.all([
        momentsApi.moments(site, query, which, ctl.signal).then((d) => pinsFromMoments(d.moments ?? [], true)).catch(none),
        extrasApi.insights(site, query).then((d) => pinsFromInsights(d.insights ?? []).filter((p) => p.day)).catch(none),
      ]).then(([a, b]) => !ctl.signal.aborted && setFound({ key, pins: dedupePins([...a, ...b]) }))
    })
    return () => {
      cancel()
      ctl.abort()
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content: query is a new object each render
  return found && found.key === key ? found.pins : null
}
