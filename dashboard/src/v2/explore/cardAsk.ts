// What a card's "Why?" asks Peek: the card, the period, the filters on, and the numbers on screen when the table has them.
import type { Filter } from '../../lib/api'
import { copy } from './copy'

interface Said {
  say?: string | null
  rows?: { name: string; v: number }[]
}

export function cardAsk(name: string, from: string, to: string, filters: Filter[] | undefined, d: Said | null): string {
  const on = (filters ?? []).map((f) => `${f.dim} ${f.op === 'not' ? '≠' : '='} ${f.value}`).join(', ')
  const top = Array.isArray(d?.rows) ? d.rows.slice(0, 3).map((r) => `${r.name}: ${r.v}`).join(', ') : ''
  return [copy.cardAsk(name, from, to), on && copy.cardAskFilters(on), d?.say, top].filter(Boolean).join(' ')
}
