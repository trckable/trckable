import { describe, expect, it } from 'vitest'
import { cardCopy as cards } from '../features/cards/copy'
import { copy } from './addGoalsCopy'

describe('where a new goal shows up', () => {
  it('the three code tabs say it appears after the first click or event', () => {
    expect(copy.appears.html).toContain('after the first click')
    expect(copy.appears.js).toContain('after the first event')
    expect(copy.appears.api).toContain('after the first event')
    for (const line of Object.values(copy.appears)) expect(line).toContain('Nothing to save.')
  })
  it('the empty Goals card says when goals appear', () => {
    expect(cards.noGoals).toBe('Goals appear here after the first visit, click or event.')
  })
})
