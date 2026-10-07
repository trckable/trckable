import { describe, expect, it } from 'vitest'
import type { Answer } from './rules'
import { subjectOf } from './useOwnSeries'

const base: Omit<Answer, 'key'> = { question: '', line: '', sub: '', look: 'plain', big: '', status: '' }

describe('subjectOf', () => {
  it('reads the page and the channel an answer is about', () => {
    expect(subjectOf({ ...base, key: 'page', act: { label: '', filters: [{ dim: 'entry_page', value: '/pricing' }] } })).toEqual({ dim: 'entry_page', value: '/pricing' })
    expect(subjectOf({ ...base, key: 'fix', act: { label: '', filters: [{ dim: 'channel', value: 'Search' }] } })).toEqual({ dim: 'channel', value: 'Search' })
  })
  it('leaves the other answers on the site line', () => {
    expect(subjectOf({ ...base, key: 'did', act: { label: '', filters: [{ dim: 'channel', value: 'x' }] } })).toBeUndefined()
    expect(subjectOf({ ...base, key: 'page' })).toBeUndefined()
  })
})
