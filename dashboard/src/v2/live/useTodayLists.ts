// The pages and countries behind the Analytics card's headline: the site's day so far, the same period as the number
// above them (the half hour's own list is only who is on the site now, one row per person). undefined while it is read,
// null when it could not be (or there are no visits), so the card falls back to the half hour.
import { useEffect, useState } from 'react'
import { cachedReport, type Row } from '../../lib/api'
import { todayIn } from '../../lib/dates'
import { countryName } from '../../lib/format'
import { deviceCounts, type Lists } from './liveModel'

const top = (rows: Row[] | null | undefined) => (rows ?? []).filter((r) => r.visitors > 0).slice(0, 5)

export function useTodayLists(site: string, timezone: string, visitors: number): Lists | null | undefined {
  const [got, setGot] = useState<{ key: string; lists: Lists | null } | null>(null)
  const key = site + timezone
  const on = visitors > 0
  useEffect(() => {
    if (!on) return
    let live = true
    const day = todayIn(timezone)
    void cachedReport(site, { from: day, to: day }, 5000)
      .then((r): Lists => {
        const d = r.current.dims
        return {
          pages: top(d.page).map((p) => ({ label: p.value, n: p.visitors })),
          countries: top(d.country).map((c) => ({ label: countryName(c.value.toUpperCase()), key: c.value.toUpperCase(), n: c.visitors })),
          devices: deviceCounts((d.device ?? []).map((r) => [r.value, r.visitors])),
        }
      })
      .catch(() => null)
      .then((lists) => live && setGot({ key, lists }))
    return () => {
      live = false
    }
  }, [site, timezone, on, key, visitors])
  if (!on) return null
  return got && got.key === key ? got.lists : undefined
}
