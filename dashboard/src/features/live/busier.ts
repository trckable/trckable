// "Busier than usual": when Live says it, and the words of the panel behind it.
// The rule itself lives on the server (internal/busier); this reads its answer.
import { countryName } from '../../lib/format'
import type { Busier } from './api'
import { copy } from './copy'

/** Quieter-than-usual is worked out by the server and held back: flip this to show it. */
export const SHOW_QUIETER = false

/** The state the line shows, or null when there is nothing to say. */
export function shown(b: Busier | null): 'busier' | 'quieter' | null {
  if (!b || !b.baseline) return null
  if (b.state === 'busier') return 'busier'
  return b.state === 'quieter' && SHOW_QUIETER ? 'quieter' : null
}

/** Clock time of a unix second in the site's zone, "14:32". */
export function clock(sec: number, timezone: string): string {
  const f = (zone: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(sec * 1000)
  try {
    return f(timezone || 'UTC')
  } catch {
    return f('UTC')
  }
}

/** The extra people, as the panel tells them: sources first (the first with
 *  the page they land on), then a country or campaign, then what is left. */
export function parts(b: Busier, timezone: string): string[] {
  const of = (dim: Busier['why'][number]['dim']) => b.why.filter((w) => w.dim === dim)
  const sources = of('source')
  const page = of('page')[0]
  const out: string[] = []
  sources.forEach((s, i) => {
    const text = copy.fromSource(s.plus, s.value)
    out.push(i === 0 && page ? `${text} → ${copy.mostly(page.value)}` : text)
  })
  if (sources.length === 0 && page) out.push(copy.onPage(page.plus, page.value))
  const country = of('country')[0]
  if (country) out.push(copy.fromCountry(country.plus, countryName(country.value)))
  const campaign = of('campaign')[0]
  if (campaign) out.push(copy.inCampaign(campaign.plus, campaign.value))
  if (out.length === 0) {
    out.push(copy.noOne)
  } else {
    const extra = b.now - b.usual
    out.push(b.rest <= Math.max(2, extra * 0.2) ? copy.restUsual : copy.restElse(b.rest))
  }
  if (b.since) out.push(b.since_capped ? copy.startedBefore(clock(b.since, timezone)) : copy.started(clock(b.since, timezone)))
  out.push(copy.going)
  return out
}
