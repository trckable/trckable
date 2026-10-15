import { describe, expect, it } from 'vitest'
import type { Link, LinksAnswer } from './api'
import { linkAnswer } from './linkAnswer'

const link = (o: Partial<Link>): Link => ({ dim: 'referrer', value: '', visitors: 0, goals: 0, last: 0, spark: [], ...o })
const read = (links: Link[], goals = true): LinksAnswer => ({ links, goals })

describe('linkAnswer', () => {
  it('is nothing without a read, or without enough to say', () => {
    expect(linkAnswer(null)).toBeNull()
    expect(linkAnswer(read([link({ value: 'a', visitors: 19 })]))).toBeNull()
    expect(linkAnswer(read([]))).toBeNull()
  })

  it('names the best link and one runner-up, with its sign-ups as the figure', () => {
    const a = linkAnswer(read([link({ value: 'betalist', visitors: 40 }), link({ value: 'producthunt', visitors: 120, goals: 6 })]), 0.025)
    expect(a?.big).toBe('6')
    expect(a?.line).toBe('Your producthunt link brought 120 visitors and 6 sign-ups. betalist brought 40, none signed up.')
    expect(a?.chip).toBe('5% · 2× usual')
    expect(a?.status).toBe('sign-ups')
    expect(a?.act).toEqual({ label: "See producthunt's visitors", filters: [{ dim: 'referrer', value: 'producthunt' }] })
  })

  it('tells visitors when the site counts no goal', () => {
    const a = linkAnswer(read([link({ dim: 'source', value: 'newsletter', visitors: 30 }), link({ value: 'friend', visitors: 7 })], false))
    expect(a?.big).toBe('30')
    expect(a?.line).toBe('Your newsletter link brought 30 visitors. friend brought 7.')
    expect(a?.chip).toBeUndefined()
    expect(a?.act?.filters).toEqual([{ dim: 'source', value: 'newsletter' }])
  })

  it('shows a link that has a goal even with few visitors', () => {
    expect(linkAnswer(read([link({ value: 'friend', visitors: 3, goals: 1 })]))?.line).toBe('Your friend link brought 3 visitors and 1 sign-up.')
  })

  it('never counts a local address', () => {
    expect(linkAnswer(read([link({ value: 'localhost', visitors: 900, goals: 40 }), link({ value: '127.0.0.1', visitors: 500 })]))).toBeNull()
    expect(linkAnswer(read([link({ value: 'localhost', visitors: 900 }), link({ value: 'ph', visitors: 25 })]))?.line).toBe('Your ph link brought 25 visitors.')
  })
})
