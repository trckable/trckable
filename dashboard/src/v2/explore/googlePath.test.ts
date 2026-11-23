import { describe, expect, it } from 'vitest'
import type { Row } from '../../lib/api'
import { arrivedOf, pathOf, seenWindow } from './googlePath'

const row = (value: string, visitors: number) => ({ value, visitors, pageviews: visitors }) as Row

describe('the Google path', () => {
  it('adds our people from every Google site, and from nothing else', () => {
    expect(arrivedOf([row('google.com', 200), row('www.google.de', 30), row('x.com', 33), row('notgoogle.com', 9)])).toBe(230)
    expect(arrivedOf(null)).toBe(0)
  })

  it('joins what Google says with who we saw when Search Console is connected', () => {
    expect(pathOf({ shown: 12400, clicked: 310 }, [row('google.com', 280)])).toEqual({ shown: 12400, clicked: 310, arrived: 280 })
  })

  it('has no path where Search Console is not connected', () => {
    expect(pathOf(null, [row('google.com', 280)])).toBeNull()
    expect(pathOf(undefined, [])).toBeNull()
  })

  it('reads Google for the last complete days as long as the period', () => {
    // Today 2026-11-23, a 7-day period ending today: Google's newest complete day is 11-20.
    expect(seenWindow({ from: '2026-11-17', to: '2026-11-23' }, '2026-11-23')).toEqual({ from: '2026-11-14', to: '2026-11-20' })
    // One day: the one day Google has.
    expect(seenWindow({ from: '2026-11-23', to: '2026-11-23' }, '2026-11-23')).toEqual({ from: '2026-11-20', to: '2026-11-20' })
  })

  it('keeps a finished period as it is', () => {
    expect(seenWindow({ from: '2026-10-01', to: '2026-10-31' }, '2026-11-23')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })
})
