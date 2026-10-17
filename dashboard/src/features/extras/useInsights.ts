// What the server found for the period, for the Highlights tab.
import { useEffect, useState } from 'react'
import type { ReportQuery } from '../../lib/api'
import { extrasApi, type Insight } from './extrasApi'

/** What the server found for the period; null until it answers, and empty for a quiet site. */
export function useInsights(site: string, query: ReportQuery, on: boolean): Insight[] | null {
  const [found, setFound] = useState<{ key: string; list: Insight[] } | null>(null)
  const key = `${site}|${query.from}|${query.to}|${query.attr ?? ''}|${query.testPayments ? 'test' : ''}`
  useEffect(() => {
    if (!on) return
    let live = true
    extrasApi
      .insights(site, query)
      .then((d) => live && setFound({ key, list: d.insights }))
      .catch(() => live && setFound({ key, list: [] }))
    return () => {
      live = false
    }
  }, [key, on]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content: query is a new object each render
  return found && found.key === key ? found.list : null
}
