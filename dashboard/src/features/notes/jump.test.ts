import { describe, expect, it } from 'vitest'
import { jumpPatch } from './jump'

const range = { from: '2026-09-01', to: '2026-09-27' }

describe('jumpPatch', () => {
  it('picks a day inside the period where it is', () => {
    expect(jumpPatch('2026-09-10', range, true, '2026-09-27')).toEqual({ day: '2026-09-10' })
  })
  it('opens a month around a day outside the period', () => {
    expect(jumpPatch('2026-03-10', range, true, '2026-09-27')).toMatchObject({ period: 'custom', from: '2026-02-23', to: '2026-03-24', day: '2026-03-10' })
  })
  it('never past today', () => {
    expect(jumpPatch('2026-09-20', { from: '2026-09-27', to: '2026-09-27' }, true, '2026-09-27')).toMatchObject({ from: '2026-08-29', to: '2026-09-27', day: '2026-09-20' })
  })
  it('switches to days when the chart is by week', () => {
    expect(jumpPatch('2026-09-10', range, false, '2026-09-27')).toMatchObject({ period: 'custom', day: '2026-09-10' })
  })
})
