// One month of the calendar, in one request. The month on screen stays while
// the next one loads, so the grid never empties between two months.
import { useCallback, useEffect, useState } from 'react'
import { call, reportURL, type Filter } from '../../lib/api'
import type { CalMonth } from './model'

interface Got {
  key: string
  data: CalMonth | null
  failed: boolean
}

export function useCalMonth(site: string, month: string, filters: Filter[], test?: boolean) {
  const key = site + month + JSON.stringify(filters) + (test ? 't' : '')
  const [got, setGot] = useState<Got>({ key: '', data: null, failed: false })
  const [again, setAgain] = useState(0)
  useEffect(() => {
    const stop = new AbortController()
    // The report's own selectors (filters, test payments); the month is the range.
    const url = reportURL(site, { from: month + '-01', to: month + '-01', filters, testPayments: test }).replace('/report?', '/calendar?') + '&month=' + month
    call<CalMonth>('GET', url, undefined, stop.signal, true)
      .then((data) => setGot({ key, data, failed: false }))
      .catch(() => !stop.signal.aborted && setGot((g) => ({ key, data: g.data, failed: true })))
    return () => stop.abort()
  }, [key, again]) // eslint-disable-line react-hooks/exhaustive-deps -- key is the site, month and filters
  const reload = useCallback(() => setAgain((n) => n + 1), [])
  return { data: got.data, loading: got.key !== key, failed: got.failed && got.key === key, reload }
}
