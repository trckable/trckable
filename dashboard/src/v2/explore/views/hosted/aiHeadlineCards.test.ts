import { describe, expect, it } from 'vitest'
import type { AiSearchReport } from '../../../../lib/apiMore'
import { headlineItems } from './AiHeadline'

const rep: AiSearchReport = { visitors: 9, assistants: [], referrers: [], crawled: 400, humans: 10, per_visitor: 40, companies: [{ name: 'OpenAI', hits: 300 }], bots: [], pages: [], google: false }

describe('headlineItems', () => {
  it('has four cards, and drops bots per visitor when a filter is on', () => {
    expect(headlineItems(rep).map((i) => i.key)).toEqual(['requests', 'per', 'top', 'sent'])
    expect(headlineItems(rep, true).map((i) => i.key)).toEqual(['requests', 'top', 'sent'])
  })
  it('without robot data only the visitors show', () => expect(headlineItems({ ...rep, crawled: 0, companies: [] }).map((i) => i.key)).toEqual(['sent']))
})
