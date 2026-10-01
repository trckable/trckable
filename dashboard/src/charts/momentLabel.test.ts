import { describe, expect, it } from 'vitest'
import { momentLabel } from './momentLabel'

describe('momentLabel', () => {
  it('names the hour with its day, and any other bucket as the chart does', () => {
    expect(momentLabel('2026-09-14T15:00', 'hour')).toBe('Sep 14, 15:00')
    expect(momentLabel('2026-09-14T00:00', 'hour')).toBe('Sep 14, 00:00')
    expect(momentLabel('2026-09-14T00:00', 'day')).toBe('Sep 14')
    expect(momentLabel('', 'hour')).toBe('')
  })
})
