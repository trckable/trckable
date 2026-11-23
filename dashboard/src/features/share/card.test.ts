import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { ACCENTS, CARDS, DEFAULT_STYLE, FORMATS, STYLES, cardOf, cardOfTopic, cardUrl, fileName, formatOf, hasOf, offered, periodOf, topicOfSection, type CardWords, type Look } from './card'
import { PLACES, sizeAt } from './places'

const look: Look = { card: 'toppage', shape: 'post', period: '30d', ...DEFAULT_STYLE, style: 'paper', accent: '#4f8cff' }
const q = (l: Look, f?: 'png' | 'json' | 'thumb') => Object.fromEntries(new URL(cardUrl('s 1', l, f), 'http://x').searchParams)
const words = (o: Partial<CardWords> = {}): CardWords => ({ has_data: true, has_sources: true, has_changed: true, has_search: true, has_bestday: true, has_milestone: true, post: '', ...o })

describe('cardUrl', () => {
  it('asks in the page\'s language, and says nothing for English', async () => {
    expect(q(look)).not.toHaveProperty('lang')
    vi.stubGlobal('localStorage', { getItem: () => 'de' })
    vi.resetModules()
    const german = await import('./card')
    expect(Object.fromEntries(new URL(german.cardUrl('s', look, 'json'), 'http://x').searchParams).lang).toBe('de')
    expect(Object.fromEntries(new URL(german.cardUrl('s', look, 'thumb'), 'http://x').searchParams).lang).toBe('de')
    vi.unstubAllGlobals()
  })
  it('asks for the card with every choice, the style as its theme and background', () => {
    expect(new URL(cardUrl('s 1', look), 'http://x').pathname).toBe('/api/v1/sites/s%201/card')
    expect(q(look)).toEqual({ t: 'toppage', period: '30d', shape: 'post', theme: 'light', bg: 'solid', accent: '#4f8cff', metric: 'visitors' })
    expect(q({ ...look, style: 'ocean' })).toMatchObject({ theme: 'dark', bg: 'ocean' })
    expect(q({ ...look, style: 'sunset' })).toMatchObject({ theme: 'light', bg: 'sunset' })
  })
  it('leaves the date and the site name off when they are switched off', () => {
    expect(q(look)).not.toHaveProperty('date')
    expect(q({ ...look, date: false, name: false })).toMatchObject({ date: '0', name: '0' })
  })
  it('draws the people card without its chart as the numbers card', () => {
    expect(q({ ...look, card: 'overview', chart: false }).t).toBe('numbers')
    expect(q({ ...look, card: 'overview' }).t).toBe('overview')
  })
  it('names the milestone it is for, and only for the milestone card', () => {
    expect(q({ ...look, card: 'milestone', ms: 'visitors~10000' }).ms).toBe('visitors~10000')
    expect(q({ ...look, ms: 'visitors~10000' })).not.toHaveProperty('ms')
  })
  it('asks for the words with the card they are for, and without the look', () => {
    expect(q(look, 'json')).toEqual({ t: 'toppage', period: '30d', format: 'json' })
  })
  it('asks for the strip\'s small picture at the link preview\'s size', () => {
    expect(q(look, 'thumb')).toMatchObject({ thumb: '1', t: 'toppage' })
    expect(q(look, 'thumb')).not.toHaveProperty('shape')
  })
  it('asks with the site\'s branding choice only when it has one', () => {
    expect(q(look)).not.toHaveProperty('brand')
    expect(q({ ...look, hideBrand: true }).brand).toBe('0')
    expect(q({ ...look, hideBrand: false }).brand).toBe('1')
  })
  it('asks for each period chip by its own name, a custom range with its two days and no other', () => {
    expect(q({ ...look, period: '7d' }).period).toBe('7d')
    expect(q({ ...look, period: '12mo' }).period).toBe('12mo')
    expect(q({ ...look, period: 'all' })).toMatchObject({ period: 'all' })
    expect(q({ ...look, period: 'all' })).not.toHaveProperty('from')
    expect(q({ ...look, period: 'custom', from: '2026-03-01', to: '2026-06-14' })).toMatchObject({ period: 'custom', from: '2026-03-01', to: '2026-06-14' })
    expect(q({ ...look, period: '30d', from: '2026-03-01', to: '2026-06-14' })).not.toHaveProperty('from')
    expect(q({ ...look, period: 'custom', from: '2026-03-01', to: '2026-06-14' }, 'json')).toMatchObject({ period: 'custom', from: '2026-03-01', to: '2026-06-14', format: 'json' })
  })
  it('names the file by card, size and period', () => {
    expect(fileName('example.com', { ...look, period: 'custom', from: '2026-03-01', to: '2026-06-14' })).toBe('trckable-example.com-toppage-post-2026-03-01_2026-06-14.png')
    expect(fileName('example.com', look)).toBe('trckable-example.com-toppage-post-30d.png')
    expect(fileName('example.com', { ...look, card: 'milestone', ms: 'visitors~10000', shape: 'square' })).toBe('trckable-example.com-milestone-visitors-10000-square.png')
  })
})

describe('the studio\'s choices', () => {
  it('has six backgrounds and six colours', () => {
    expect(STYLES).toHaveLength(6)
    expect(ACCENTS).toHaveLength(6)
    expect(new Set(STYLES.map((s) => `${s.theme}/${s.bg}`)).size).toBe(6)
  })
  it('takes the page\'s period as the nearest card period', () => {
    expect([periodOf('today'), periodOf('yesterday'), periodOf('7d'), periodOf('30d'), periodOf('90d'), periodOf('custom'), periodOf()]).toEqual(['7d', '7d', '7d', '30d', '30d', '30d', '30d'])
  })
  it('opens on the card of the Explore section it was opened from, the people card for the rest', () => {
    expect([cardOfTopic('sources'), cardOfTopic('pages'), cardOfTopic('changed'), cardOfTopic('milestone'), cardOfTopic('places'), cardOfTopic()]).toEqual(['sources', 'toppage', 'changed', 'milestone', 'overview', 'overview'])
    expect([topicOfSection('pages'), topicOfSection('nonsense')]).toEqual(['pages', undefined])
    expect(CARDS.map((c) => cardOf(c.id).id)).toEqual(CARDS.map((c) => c.id))
  })
})

describe('which cards are offered', () => {
  const ids = (has: ReturnType<typeof hasOf>, reached: number) => offered(has, reached).flatMap((g) => g.cards)
  it('offers every card to a site that has everything', () => {
    expect(offered(hasOf(words()), 3).map((g) => g.group)).toEqual(['people', 'milestones', 'sources', 'pages'])
    expect(ids(hasOf(words()), 3)).toHaveLength(CARDS.length)
  })
  it('offers no Seen in Google without Search Console', () => {
    expect(ids(hasOf(words({ has_search: false })), 3)).not.toContain('search')
    expect(ids(hasOf(words({ has_search: false })), 3)).toContain('sources')
  })
  it('offers no Milestones group without a milestone', () => {
    expect(offered(hasOf(words()), 0).map((g) => g.group)).not.toContain('milestones')
  })
  it('leaves out a group with nothing in it, and a card the period cannot fill', () => {
    expect(offered(hasOf(words({ has_sources: false, has_search: false })), 1).map((g) => g.group)).toEqual(['people', 'milestones', 'pages'])
    expect(ids(hasOf(words({ has_changed: false, has_bestday: false })), 1)).not.toEqual(expect.arrayContaining(['changed', 'bestday']))
  })
})

describe('the sizes', () => {
  it('are the server\'s: formats.json equals the list the card code draws by', () => {
    const go = readFileSync(new URL('../../../../server/internal/cards/format.go', import.meta.url), 'utf8')
    const server = [...go.matchAll(/\{"(\w+)", (\d+), (\d+)\}/g)].map((m) => ({ id: m[1], w: Number(m[2]), h: Number(m[3]) }))
    expect(FORMATS).toEqual(server)
  })
  it('give every place only sizes that exist, the first being the one it opens on', () => {
    for (const p of PLACES) {
      expect(p.sizes.length).toBeGreaterThan(0)
      for (const s of p.sizes) expect(FORMATS.map((f) => f.id)).toContain(s.shape)
      expect(sizeAt(p.id, 0)).toBe(p.sizes[0])
      expect(sizeAt(p.id, 99)).toBe(p.sizes[p.sizes.length - 1])
    }
  })
  it('are the ones each place asks for', () => {
    const px = (id: Parameters<typeof sizeAt>[0], i: number) => {
      const f = formatOf(sizeAt(id, i).shape)
      return `${f.w}×${f.h}`
    }
    expect([px('x', 0), px('x', 1), px('linkedin', 0), px('linkedin', 1)]).toEqual(['1600×900', '1080×1080', '1200×627', '1080×1080'])
    expect([px('instagram', 0), px('instagram', 1), px('instagram', 2), px('threads', 0), px('facebook', 0), px('bluesky', 0)]).toEqual(['1080×1350', '1080×1920', '1080×1080', '1080×1350', '1200×630', '1600×900'])
    expect([px('download', 0), px('download', 1), px('download', 2), px('email', 0)]).toEqual(['1600×900', '1080×1080', '1080×1920', '1200×630'])
  })
})
