// The pages a site really recorded over its last 90 days (its top hundred), for goals worth suggesting: the open report's
// own top ten rarely holds a thank-you page.
import { useEffect, useState } from 'react'
import { api } from '../lib/apiMore'

export function useMorePages(site: string, on = true): string[] {
  const [pages, setPages] = useState<string[]>([])
  useEffect(() => {
    if (!on) return
    const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10)
    const ctl = new AbortController()
    api
      .report(site, { from: day(90), to: day(0), limit: 100 }, ctl.signal)
      .then((r) => setPages((r.current.dims.page ?? []).map((x) => x.value)))
      .catch(() => {})
    return () => ctl.abort()
  }, [site, on])
  return pages
}
