// What a list's rows get a moment after they are drawn, from two small
// requests kept out of the first load: each row's last 30 days as a sparkline
// (server/internal/query/sparks.go, one scan for all rows) and, for referrers,
// which of the sites have an icon this server has fetched (the browser never
// asks the site, or anyone else).
import { call, rangeQS, type Filter } from '../../lib/api'
import { addDays, todayIn } from '../../lib/dates'

export const SPARK_DAYS = 30

export interface Extras {
  spark?: Record<string, number[]>
  icons?: Set<string>
}

export async function fetchRowExtras(o: { site: string; tz: string; dim: string; keys: string[]; filters: Filter[]; spark: boolean; icons: boolean }): Promise<Extras> {
  const site = encodeURIComponent(o.site)
  const sparks = async () => {
    const to = todayIn(o.tz)
    const qs = rangeQS({ from: addDays(to, 1 - SPARK_DAYS), to, filters: o.filters }) + '&dim=' + encodeURIComponent(o.dim) + o.keys.map((v) => '&v=' + encodeURIComponent(v)).join('')
    return (await call<{ rows: Record<string, number[]> }>('GET', `/sites/${site}/sparks` + qs, undefined, undefined, true)).rows
  }
  const icons = async () => new Set((await call<{ icons: string[] }>('GET', '/referrer-icons?' + o.keys.map((h) => 'host=' + encodeURIComponent(h)).join('&'), undefined, undefined, true)).icons)
  // Either may fail on its own (a list without charts or pictures is still a list).
  const [spark, found] = await Promise.all([o.spark ? sparks().catch(() => undefined) : undefined, o.icons ? icons().catch(() => undefined) : undefined])
  return { spark, icons: found }
}
