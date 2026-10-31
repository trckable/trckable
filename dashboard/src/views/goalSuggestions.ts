// Goals worth counting, read from the pages this site has really recorded:
// a thank-you page, a sign-up page, pricing. A path is never invented, and a
// name says only what a page visit is.
import type { ContentGroup } from '../lib/api'
import { copy as all } from './addGoalsCopy'

const copy = all.suggested

export interface Suggestion {
  name: string
  path: string
}

// In the order they are offered: the "Reached" group first.
const GROUPS: { name: string; first: string[] }[] = [
  { name: copy.names.thanks, first: ['thanks', 'thank-you', 'thankyou'] },
  { name: copy.names.confirm, first: ['success', 'confirmed', 'confirmation', 'order-confirmation'] },
  { name: copy.names.welcome, first: ['welcome'] },
  { name: copy.names.signup, first: ['signup', 'sign-up', 'register', 'join'] },
  { name: copy.names.pricing, first: ['pricing', 'plans'] },
  { name: copy.names.contact, first: ['contact'] },
]

export const MAX_SUGGESTIONS = 4

export function goalSuggestions(pages: string[], existing: ContentGroup[]): Suggestion[] {
  const out: Suggestion[] = []
  for (const g of GROUPS) {
    // The first recorded segment of this group, as written, and whether it was seen alone and/or deeper.
    let seg = ''
    let alone = false
    let deeper = false
    for (const p of pages) {
      const parts = p.split('/')
      if (parts[0] !== '' || !parts[1]) continue
      const s = parts[1]
      if (!g.first.includes(s.toLowerCase())) continue
      if (seg && s.toLowerCase() !== seg.toLowerCase()) continue
      seg = seg || s
      if (parts.length > 2 && parts.slice(2).some(Boolean)) deeper = true
      else alone = true
    }
    if (!seg) continue
    const path = deeper ? `/${seg}/*` : `/${seg}`
    if (!alone && !deeper) continue
    if (existing.some((e) => e.name === g.name || e.path === path)) continue
    out.push({ name: g.name, path })
    if (out.length === MAX_SUGGESTIONS) break
  }
  return out
}
