// Highlights: what the server found (server/internal/insights), worded. Every
// figure is the report's own; nothing here decides what is worth saying.
// Pure: highlightModel.test.ts.
import type { Insight } from './extrasApi'
import { channelLabel } from '../../lib/palette'
import { extrasCopy } from './copy'

export type Tone = 'up' | 'down' | 'money' | 'warn' | 'new'

export interface HighlightRow {
  key: string
  tone: Tone
  text: string
  /** The filter a click applies. */
  dim: string
  value: string
}

const sourceName = (dim: string, value: string) => (dim === 'channel' ? channelLabel(value) : value || '/')

export function highlightRows(list: Insight[], money: (minor: number) => string): HighlightRow[] {
  const c = extrasCopy.highlights
  return list.map((i): HighlightRow => {
    const base = { key: `${i.kind}:${i.value}`, dim: i.dim, value: i.value }
    const name = sourceName(i.dim, i.value)
    switch (i.kind) {
      case 'source_move':
        return { ...base, tone: (i.change ?? 0) >= 0 ? 'up' : 'down', text: c.moved(name, i.change ?? 0, i.now, i.was ?? 0) }
      case 'top_revenue':
        return { ...base, tone: 'money', text: c.pays(name, money(Math.round(i.per_visitor ?? 0)), i.times ?? 0) }
      case 'conversion_drop':
        return { ...base, tone: 'warn', text: c.drop(name, i.was_rate ?? 0, i.rate ?? 0) }
      default:
        return { ...base, tone: 'new', text: c.fresh(name, i.now) }
    }
  })
}
