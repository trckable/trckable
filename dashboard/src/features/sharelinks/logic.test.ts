import { describe, expect, it } from 'vitest'
import { EMPTY, daysUntil, endState, expiryDays, linkBody, parseOrigins, previewParts, problem } from './logic'

// Noon on 15 Oct 2026, the viewer's clock.
const NOW = new Date(2026, 9, 15, 12, 0, 0)

describe('days until an end date', () => {
  it('counts whole calendar days from today', () => {
    expect(daysUntil('2026-10-16', NOW)).toBe(1)
    expect(daysUntil('2026-11-14', NOW)).toBe(30)
    expect(daysUntil('2027-10-15', NOW)).toBe(365)
  })
  it('refuses today, the past, a blank and more than ten years', () => {
    expect(daysUntil('2026-10-15', NOW)).toBeNull()
    expect(daysUntil('2026-10-01', NOW)).toBeNull()
    expect(daysUntil('', NOW)).toBeNull()
    expect(daysUntil('2036-10-12', NOW)).toBe(3650)
    expect(daysUntil('2036-10-13', NOW)).toBeNull()
  })
  it('is not thrown by a clock change', () => {
    // Late March: the clocks may move an hour inside the span.
    expect(daysUntil('2027-03-31', new Date(2027, 2, 20, 23, 30))).toBe(11)
  })
})

describe('the days sent for each choice', () => {
  it('never is 0, 7 and 30 are themselves, a date is converted', () => {
    expect(expiryDays({ expiry: 'never', date: '' }, NOW)).toBe(0)
    expect(expiryDays({ expiry: '7', date: '' }, NOW)).toBe(7)
    expect(expiryDays({ expiry: '30', date: '' }, NOW)).toBe(30)
    expect(expiryDays({ expiry: 'date', date: '2026-10-25' }, NOW)).toBe(10)
    expect(expiryDays({ expiry: 'date', date: '' }, NOW)).toBeNull()
  })
})

describe('embed sites, checked the way the server checks them', () => {
  it('takes origins split by spaces or commas and drops a trailing slash', () => {
    expect(parseOrigins('https://a.com, https://b.com/ https://a.com').list).toEqual(['https://a.com', 'https://b.com'])
    expect(parseOrigins('').list).toEqual([])
  })
  it('allows http only for localhost', () => {
    expect(parseOrigins('http://localhost:3000').list).toEqual(['http://localhost:3000'])
    expect(parseOrigins('http://127.0.0.1').list).toEqual(['http://127.0.0.1'])
    expect(parseOrigins('http://example.com').bad).toBe('http://example.com')
  })
  it('refuses a path, a query, a sign-in part and a bare word', () => {
    for (const s of ['https://a.com/page', 'https://a.com?x=1', 'https://me@a.com', 'a.com', 'ftp://a.com', 'https://']) expect(parseOrigins(s).bad).toBe(s)
  })
  it('allows five and flags a sixth', () => {
    const five = 'https://a.com https://b.com https://c.com https://d.com https://e.com'
    expect(parseOrigins(five).tooMany).toBe(false)
    expect(parseOrigins(five + ' https://f.com').tooMany).toBe(true)
  })
})

describe('the form', () => {
  it('a password link needs a password, a blank one does not count', () => {
    expect(problem({ ...EMPTY, access: 'password' }, NOW)?.field).toBe('password')
    expect(problem({ ...EMPTY, access: 'password', password: '   ' }, NOW)?.field).toBe('password')
    expect(problem({ ...EMPTY, access: 'password', password: 'x' }, NOW)).toBeNull()
  })
  it('a picked date must be a usable day; embedding needs an address', () => {
    expect(problem({ ...EMPTY, expiry: 'date' }, NOW)?.field).toBe('date')
    expect(problem({ ...EMPTY, embed: true }, NOW)?.field).toBe('sites')
    expect(problem({ ...EMPTY, embed: true, sites: 'nope' }, NOW)?.field).toBe('sites')
    expect(problem({ ...EMPTY, embed: true, sites: 'https://a.com' }, NOW)).toBeNull()
  })
  it('sends a password only for a password link, sites only when embedding is on', () => {
    const typed = { ...EMPTY, password: 'left over', sites: 'https://a.com' }
    expect(linkBody(typed, 'site.com', NOW)).toEqual({ name: 'site.com', password: '', revenue: false, notes: false, days: 0, embed_origins: [] })
    const full = { ...typed, name: ' Board ', access: 'password' as const, revenue: true, notes: true, expiry: '7' as const, embed: true }
    expect(linkBody(full, 'site.com', NOW)).toEqual({ name: 'Board', password: 'left over', revenue: true, notes: true, days: 7, embed_origins: ['https://a.com'] })
  })
})

describe('what the thumbnail draws', () => {
  it('revenue shows or hides the tile and the bars', () => {
    expect(previewParts({ ...EMPTY, revenue: true }, false, NOW)).toMatchObject({ revenueTile: true, revenueBars: true })
    expect(previewParts(EMPTY, false, NOW)).toMatchObject({ revenueTile: false, revenueBars: false })
  })
  it('notes show or hide the markers', () => {
    expect(previewParts({ ...EMPTY, notes: true }, false, NOW).notes).toBe(true)
    expect(previewParts(EMPTY, false, NOW).notes).toBe(false)
  })
  it('shows the end date, when there is one', () => {
    expect(previewParts(EMPTY, false, NOW).ends).toBeNull()
    expect(previewParts({ ...EMPTY, expiry: '7' }, false, NOW).ends?.getDate()).toBe(22)
    expect(previewParts({ ...EMPTY, expiry: 'date', date: '2026-10-25' }, false, NOW).ends?.getDate()).toBe(25)
  })
  it('the lock switches to the password screen, for a password link only', () => {
    expect(previewParts({ ...EMPTY, access: 'password' }, true, NOW).lock).toBe(true)
    expect(previewParts({ ...EMPTY, access: 'password' }, false, NOW).lock).toBe(false)
    expect(previewParts(EMPTY, true, NOW).lock).toBe(false)
  })
})

describe('a row\'s end date', () => {
  it('is none, ahead or past', () => {
    expect(endState({ expires_at: null })).toBe('none')
    expect(endState({ expires_at: 500 }, 1_000_000)).toBe('past')
    expect(endState({ expires_at: 500 }, 1_000)).toBe('ahead')
  })
})
