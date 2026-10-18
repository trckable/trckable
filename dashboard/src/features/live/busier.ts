// "Busier than usual": when Live says it, and the words of the panel behind it.
// The rule itself lives on the server (internal/busier); this reads its answer.
import { countryName, dateFmt } from '../../lib/format'
import type { Busier } from './api'
import { copy } from './copy'
import type { Surge } from '../signals/surge'

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
  const f = (zone: string) => dateFmt('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(sec * 1000)
  try {
    return f(timezone || 'UTC')
  } catch {
    return f('UTC')
  }
}

/** The extra people, as one short line: the two biggest senders (a source, a country, a
 *  campaign), when it began and that it goes on. Never a page: the card behind it has that. */
export function parts(b: Busier, timezone: string): string[] {
  const of = (dim: Busier['why'][number]['dim']) => b.why.filter((w) => w.dim === dim)
  const who = [
    ...of('source').map((s) => copy.fromSource(s.plus, s.value)),
    ...of('country').slice(0, 1).map((c) => copy.fromCountry(c.plus, countryName(c.value))),
    ...of('campaign').slice(0, 1).map((c) => copy.inCampaign(c.plus, c.value)),
  ].slice(0, 2)
  const out = who.length ? who : [copy.noOne]
  if (b.since) out.push(b.since_capped ? copy.startedBefore(clock(b.since, timezone)) : copy.started(clock(b.since, timezone)))
  out.push(copy.going)
  return out
}

/** The same busy moment as the busy-moment card tells it, with what the line knows; the card
 *  fetches the rest (the chart, the tiles) itself. */
export function asSurge(b: Busier): Surge {
  const w = (dim: Busier['why'][number]['dim']) => b.why.find((x) => x.dim === dim)
  const source = w('source')
  const page = w('page')
  const country = w('country')
  const campaign = w('campaign')
  const started = b.since ?? Math.floor(Date.now() / 1000)
  return {
    id: `busier-${started}`,
    started,
    online: b.now,
    usual: b.usual,
    times: b.usual > 0 ? b.now / b.usual : b.now,
    why: {
      source: source?.value,
      source_dim: source ? 'referrer' : undefined,
      source_n: source?.now,
      source_usual: source?.usual ?? 0,
      campaign: campaign?.value,
      page: page?.value,
      page_n: page?.now,
      country: country?.value,
      country_n: country?.now,
      before: Math.round(b.usual),
      minutes: 0,
    },
  }
}
