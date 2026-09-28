// The numbers cookieless mode cannot give, and what stands in their place.
import type { KPIs, Site } from '../../lib/api'
import { fmtPct } from '../../lib/format'
import { copy } from './copy'

/** The share of new visitors, or why there is none. */
export function newShare(k: KPIs | undefined, site: Pick<Site, 'cookieless'>): string {
  if (site.cookieless) return copy.off
  if (!k) return '–'
  return fmtPct(k.new_visitor_share)
}

/** The collapsed "More numbers" line's part about new visitors. */
export function newShareShort(k: KPIs, site: Pick<Site, 'cookieless'>): string {
  if (site.cookieless) return ''
  return ` · ${fmtPct(k.new_visitor_share)} new`
}

type Split = { a: number; b: number; aLabel: string; bLabel: string; tone?: string; fmt?: (v: number) => string }
type Line = { label: string; value: string; faint?: boolean }

/** A day's new vs returning in the chart's tooltip: a split bar, or a line
 *  saying it is off. */
export function newVsReturning(k: KPIs, site: Pick<Site, 'cookieless'>): { splits: Split[]; rows: Line[] } {
  if (site.cookieless) return { splits: [], rows: [{ label: copy.newVsReturning, value: copy.off, faint: true }] }
  const nv = Math.round(k.visitors * k.new_visitor_share)
  return { splits: [{ a: nv, b: Math.max(0, k.visitors - nv), aLabel: 'new', bLabel: 'returning' }], rows: [] }
}

/** Whether a visitor can be opened as a journey on this site. */
export const journeysOn = (site: Pick<Site, 'cookieless'>, module: boolean | undefined) => !!module && !site.cookieless
