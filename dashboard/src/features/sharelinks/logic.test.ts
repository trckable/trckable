import { describe, expect, it } from 'vitest'
import { EMPTY, daysUntil, draftOf, endState, patchBody, expiryDays, linkBody, parseOrigins, previewOptions, problem } from './logic'

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
    expect(linkBody(typed, 'site.com', NOW)).toEqual({ name: 'site.com', password: '', revenue: false, notes: false, days: 0, embed_origins: [], sections: ['pages', 'sources', 'places', 'tech'], period: '' })
    const full = { ...typed, name: ' Board ', access: 'password' as const, revenue: true, notes: true, expiry: '7' as const, embed: true }
    expect(linkBody(full, 'site.com', NOW)).toEqual({ name: 'Board', password: 'left over', revenue: true, notes: true, days: 7, embed_origins: ['https://a.com'], sections: ['pages', 'sources', 'places', 'tech'], period: '' })
  })
})

describe('changing a link that exists', () => {
  const share = { id: 'a', site_id: 's', name: 'Board', revenue: true, notes: false, has_password: true, created_at: 1, views: 0, expires_at: Math.floor(new Date(2026, 10, 20, 12).getTime() / 1000), embed_origins: ['https://a.com'] }
  const was = draftOf(share)
  it('starts from what the link has now', () => {
    expect(was).toMatchObject({ name: 'Board', access: 'password', hadPassword: true, password: '', notes: false, expiry: 'date', date: '2026-11-20', embed: true, sites: 'https://a.com' })
    expect(draftOf({ ...share, has_password: false, expires_at: null, embed_origins: undefined })).toMatchObject({ access: 'public', expiry: 'never', date: '', embed: false })
  })
  it('sends nothing for a form nobody touched, and only what changed otherwise', () => {
    expect(patchBody(was, was, NOW)).toEqual({})
    expect(patchBody(was, { ...was, name: ' Investors ', notes: true }, NOW)).toEqual({ name: 'Investors', notes: true })
  })
  it('keeps the password unless a new one is typed, removes it only when the link turns public', () => {
    expect(patchBody(was, { ...was, password: 'a new one' }, NOW)).toEqual({ password: 'a new one' })
    expect(patchBody(was, { ...was, password: '   ' }, NOW)).toEqual({})
    expect(patchBody(was, { ...was, access: 'public' }, NOW)).toEqual({ password: '' })
    expect(patchBody({ ...was, access: 'public', hadPassword: false }, { ...was, access: 'public', hadPassword: false }, NOW)).toEqual({})
  })
  it('sends the end date as days from now, and 0 for none', () => {
    expect(patchBody(was, { ...was, expiry: '30' }, NOW)).toEqual({ days: 30 })
    expect(patchBody(was, { ...was, expiry: 'never', date: '' }, NOW)).toEqual({ days: 0 })
    expect(patchBody(was, { ...was, date: '2026-10-25' }, NOW)).toEqual({ days: 10 })
  })
  it('sends the embed sites when they change, and an empty list when embedding is turned off', () => {
    expect(patchBody(was, { ...was, sites: 'https://a.com https://b.com' }, NOW)).toEqual({ embed_origins: ['https://a.com', 'https://b.com'] })
    expect(patchBody(was, { ...was, embed: false }, NOW)).toEqual({ embed_origins: [] })
  })
  it('lets a link that has ended be renamed, but not given a bad new date', () => {
    const ended = draftOf({ ...share, expires_at: Math.floor(new Date(2026, 9, 1, 12).getTime() / 1000) })
    expect(problem({ ...ended, name: 'Renamed' }, NOW, ended)).toBeNull()
    expect(problem({ ...ended, date: '2026-10-01' }, NOW, ended)).toBeNull()
    expect(problem({ ...ended, date: '2026-10-02' }, NOW, ended)?.field).toBe('date')
  })
  it('does not ask again for the password of a link that has one', () => {
    expect(problem(was, NOW, was)).toBeNull()
    expect(problem({ ...was, hadPassword: false, access: 'password' }, NOW)?.field).toBe('password')
  })
})

describe('what a link shows', () => {
  const link = { id: 'a', site_id: 's', name: 'Board', revenue: false, has_password: false, created_at: 1, views: 0 }
  it('starts with every section and the period left to the reader', () => {
    expect(EMPTY).toMatchObject({ sections: ['pages', 'sources', 'places', 'tech'], period: '' })
    expect(draftOf(link)).toMatchObject({ sections: ['pages', 'sources', 'places', 'tech'], period: '' })
  })
  it('sends the sections in the server order and the period when making a link', () => {
    const body = linkBody({ ...EMPTY, sections: ['tech', 'pages'], period: '7d' }, 'site.com', NOW)
    expect(body).toMatchObject({ sections: ['pages', 'tech'], period: '7d' })
    expect(linkBody({ ...EMPTY, sections: [] }, 'site.com', NOW).sections).toEqual([])
  })
  it('reads them back from a link that has them, and sends them only when they change', () => {
    const was = draftOf({ ...link, sections: ['sources', 'pages'], period: '30d' })
    expect(was).toMatchObject({ sections: ['pages', 'sources'], period: '30d' })
    expect(patchBody(was, { ...was, sections: ['sources', 'pages'] }, NOW)).toEqual({})
    expect(patchBody(was, { ...was, sections: ['pages'] }, NOW)).toEqual({ sections: ['pages'] })
    expect(patchBody(was, { ...was, sections: [], period: '' }, NOW)).toEqual({ sections: [], period: '' })
  })
})


describe('what the preview is made from', () => {
  it('is what the link shows: its name (or the site), revenue, notes, sections in order, the period', () => {
    expect(previewOptions(EMPTY, 'site.com')).toEqual({ name: 'site.com', revenue: false, notes: false, sections: ['pages', 'sources', 'places', 'tech'], period: '' })
    expect(previewOptions({ ...EMPTY, name: ' Board ', revenue: true, notes: true, sections: ['tech', 'pages'], period: '30d' }, 'site.com')).toEqual({ name: 'Board', revenue: true, notes: true, sections: ['pages', 'tech'], period: '30d' })
  })
  it('does not move for who may open the link or until when', () => {
    expect(previewOptions({ ...EMPTY, access: 'password', password: 'x', expiry: '7', embed: true, sites: 'https://a.com' }, 'site.com')).toEqual(previewOptions(EMPTY, 'site.com'))
  })
})

describe('a row\'s end date', () => {
  it('is none, ahead or past', () => {
    expect(endState({ expires_at: null })).toBe('none')
    expect(endState({ expires_at: 500 }, 1_000_000)).toBe('past')
    expect(endState({ expires_at: 500 }, 1_000)).toBe('ahead')
  })
})
