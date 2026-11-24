import { describe, expect, it } from 'vitest'
import { chars, postText, xLength } from './post'
import { shapeOfPlace, writePost } from './postWriter'
import type { Facts } from './card'

const domain = 'example.com'
const period = '25 Oct – 23 Nov 2026'
const base = { domain, foot: period, label: '' }
const FACTS: Record<string, Facts> = {
  overview: { ...base, template: 'overview', big: '10,685', label: 'people · counted once per day', change: '+12%', dir: 1, vs: 'previous 30 days', rows: [{ name: 'Google', value: '4,100' }] },
  changed: { ...base, template: 'changed', big: '', label: 'People rose 12%, mostly from Google.', rows: [{ name: 'Google', value: '+420' }, { name: '/pricing', value: '+90' }] },
  bestday: { ...base, template: 'bestday', big: '1,234', label: 'people on your best day', foot: '12 Nov 2026' },
  milestone: { ...base, template: 'milestone', big: '10,000', label: 'people', foot: '20 Oct 2026' },
  sources: { ...base, template: 'sources', big: '', rows: [{ name: 'Google', value: '4,100' }, { name: 'Direct', value: '3,000' }, { name: 'Reddit', value: '900' }, { name: 'Bing', value: '10' }] },
  search: { ...base, template: 'search', big: '', label: 'Found on Google', stats: [{ name: 'Clicks', value: '320' }, { name: 'Impressions', value: '9,100' }], rows: [{ name: 'web analytics', value: '40' }] },
  toppage: { ...base, template: 'toppage', big: '/pricing', rows: [{ name: '/pricing', value: '2,210' }] },
  leaderboard: { ...base, template: 'leaderboard', big: '', rows: [{ name: '/', value: '5,000' }, { name: '/pricing', value: '2,210' }] },
}
// Unicode's mathematical bold, italic and script letters: styled text that screen readers and search cannot read.
const FAKE_STYLE = /[\u{1D400}-\u{1D7FF}]/u
const write = (id: string, place: 'x' | 'linkedin' | 'instagram', brand = true) => writePost(FACTS[id], 'server line', place, brand)

describe('a post for X', () => {
  it.each(Object.keys(FACTS))('is short, within 280 with the link, and has no fake bold or emoji: %s', (id) => {
    const text = write(id, 'x')
    expect(xLength(text)).toBeLessThanOrEqual(280)
    expect(text.split('\n').length).toBeLessThanOrEqual(2)
    expect(text).not.toMatch(FAKE_STYLE)
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
  })
  it('says the strongest number first, the card\'s own date label, and the change with an arrow', () => {
    expect(write('overview', 'x')).toBe('10,685 people on example.com, 25 Oct – 23 Nov 2026\n↑ 12% vs previous 30 days · Top source: Google')
  })
  it('writes each card from its own facts', () => {
    expect(write('milestone', 'x')).toBe('We reached 10,000 people on example.com\n20 Oct 2026')
    expect(write('bestday', 'x')).toBe('Our best day on example.com: 1,234 people, 12 Nov 2026')
    expect(write('sources', 'x')).toBe('Where people come from on example.com, 25 Oct – 23 Nov 2026\nGoogle 4,100 · Direct 3,000 · Reddit 900')
    expect(write('toppage', 'x')).toBe('The most visited page on example.com, 25 Oct – 23 Nov 2026\n/pricing 2,210')
    expect(write('changed', 'x')).toContain('What changed on example.com, 25 Oct – 23 Nov 2026: People rose 12%, mostly from Google.\nGoogle +420')
  })
  it('shows a fall with the down arrow', () => {
    const f: Facts = { ...FACTS.overview, change: '-8%', dir: -1 }
    expect(writePost(f, '', 'x', true)).toContain('↓ 8% vs previous 30 days')
  })
  it('shrinks the list first, then cuts at a word, never in the middle of one', () => {
    const long: Facts = { ...FACTS.sources, rows: Array.from({ length: 3 }, (_, i) => ({ name: `a-source-with-a-very-long-name-${i}`.repeat(2), value: '1,000' })) }
    const some = writePost(long, '', 'x', true)
    expect(xLength(some)).toBeLessThanOrEqual(280)
    expect(some.split('\n')[0]).toBe('Where people come from on example.com, 25 Oct – 23 Nov 2026')
    const huge: Facts = { ...FACTS.changed, label: `People rose ${'wordy '.repeat(80)}`.trim() }
    const cut = writePost(huge, '', 'x', true)
    expect(xLength(cut)).toBeLessThanOrEqual(280)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.slice(0, -1).endsWith('wordy')).toBe(true)
  })
  it('is the same for Threads and Bluesky', () => {
    for (const p of ['threads', 'bluesky'] as const) expect(writePost(FACTS.overview, '', p, true)).toBe(write('overview', 'x'))
  })
})

describe('a post for LinkedIn', () => {
  it('has a headline, up to three lines, and the closing line, with real newlines', () => {
    expect(write('overview', 'linkedin')).toBe('10,685 people on example.com, 25 Oct – 23 Nov 2026\n\n↑ 12% vs previous 30 days\n· Top source: Google\n\nCounted without cookies, with trckable.')
  })
  it.each(Object.keys(FACTS))('is a multi-line post without fake bold or emoji: %s', (id) => {
    const text = write(id, 'linkedin')
    expect(text.split('\n').length).toBeGreaterThanOrEqual(3)
    expect(text.endsWith('Counted without cookies, with trckable.')).toBe(true)
    expect(text).not.toMatch(FAKE_STYLE)
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(text).not.toMatch(/#\w/)
  })
  it('lists the top three of a list, as bullets', () => {
    expect(write('sources', 'linkedin')).toBe('Where people come from on example.com, 25 Oct – 23 Nov 2026\n\n· Google 4,100\n· Direct 3,000\n· Reddit 900\n\nCounted without cookies, with trckable.')
  })
  it('drops trckable from the closing line only when the card hides the brand', () => {
    expect(write('overview', 'linkedin', false).endsWith('\n\nCounted without cookies.')).toBe(true)
    expect(write('overview', 'linkedin', true)).toContain('with trckable')
  })
  it('is a caption, the same, for Instagram and Facebook', () => {
    expect(write('overview', 'instagram')).toBe(write('overview', 'linkedin'))
    expect(writePost(FACTS.overview, '', 'facebook', true)).toBe(write('overview', 'linkedin'))
  })
  it('puts no link in the text', () => expect(write('overview', 'linkedin')).not.toMatch(/https?:/))
})

describe('the facts of a card with nothing behind it', () => {
  it('give the server\'s own line', () => {
    expect(writePost({ ...FACTS.overview, empty: true }, 'counting has begun', 'x', true)).toBe('counting has begun')
    expect(writePost(undefined, 'counting has begun', 'linkedin', true)).toBe('counting has begun')
  })
})

describe('the places', () => {
  it('are short or long', () => {
    expect(['x', 'threads', 'bluesky'].map((p) => shapeOfPlace(p as 'x'))).toEqual(['short', 'short', 'short'])
    expect(['linkedin', 'facebook', 'instagram', 'download', 'email'].map((p) => shapeOfPlace(p as 'x'))).toEqual(Array(5).fill('long'))
  })
})

describe('the written text and a person\'s own', () => {
  it('stays the person\'s own until it is reset, and the written one comes back with the card', () => {
    const written = write('overview', 'x')
    expect(postText(written, 'mine')).toBe('mine')
    expect(postText(write('toppage', 'x'), 'mine')).toBe('mine')
    expect(postText(written, null)).toBe(written)
    expect(chars(written)).toBeGreaterThan(0)
  })
})
