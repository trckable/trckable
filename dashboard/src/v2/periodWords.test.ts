import { describe, expect, it } from 'vitest'
import { hasYear, vsWords } from './periodWords'
import type { ViewState } from '../lib/url'

const view = (period: string, compare: ViewState['compare']): ViewState => ({ period, compare, filters: [], mode: 'core' })
const day = { from: '2026-10-19', to: '2026-10-19' }
const month = { from: '2026-09-20', to: '2026-10-19' }

describe('the pill says what the menu has selected', () => {
  it('Today: Before is the usual weekday, Off says nothing', () => {
    expect(vsWords(true, 'Monday', view('today', 'previous'), day)).toBe('vs usual Monday')
    expect(vsWords(true, 'Monday', view('today', 'none'), day)).toBeUndefined()
  })
  it('Today: Last year and Custom are named, not the usual', () => {
    expect(vsWords(true, 'Monday', view('today', 'year'), day)).toBe('vs a year before')
    expect(vsWords(true, 'Monday', view('today', 'custom'), day)).not.toContain('usual')
  })
  it('Last 30 days: each choice has its own words, Off none', () => {
    expect(vsWords(false, 'Monday', view('30d', 'none'), month)).toBeUndefined()
    expect(vsWords(false, 'Monday', view('30d', 'previous'), month)).toContain('30 days')
    expect(vsWords(false, 'Monday', view('30d', 'year'), month)).toBe('vs a year before')
  })
})

describe('last year needs a year of data', () => {
  it('is open for a site over a year old only', () => {
    const now = 1_800_000_000
    expect(hasYear({ created_at: now - 366 * 86400 }, now)).toBe(true)
    expect(hasYear({ created_at: now - 10 * 86400 }, now)).toBe(false)
    expect(hasYear({}, now)).toBe(false)
  })
})
