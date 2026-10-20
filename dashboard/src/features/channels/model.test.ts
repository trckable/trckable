import { describe, expect, it } from 'vitest'
import type { ChannelCard, Channels } from './api'
import { cardsOf, cardView, flashOf, header, valuesOf, waiting, whoCan } from './model'

const acct = (platform: ChannelCard['platform'], handle: string, extra = {}) => ({ id: handle, platform, handle, created_at: 1, last_ok_at: 2, ...extra })
const card = (platform: ChannelCard['platform'], extra: Partial<ChannelCard> = {}): ChannelCard => ({ platform, ready: true, accounts: [], monitoring: 0, series: [], ...extra })

describe('what a card shows', () => {
  it('is empty with no account, waiting until the first read, then ready', () => {
    expect(cardView(card('youtube'), '2026-10-18').state).toBe('empty')
    const connected = card('youtube', { accounts: [acct('youtube', '@a')], monitoring: 1 })
    expect(cardView(connected, '2026-10-18').state).toBe('waiting')
    const read = cardView({ ...connected, views: 0, series: [] }, '2026-10-18')
    expect(read.state).toBe('ready')
    expect(read.views).toBe(0) // read and nothing came: zero, not unknown
  })

  it('draws every day from the first counted to the newest, a day with no row as none', () => {
    const v = valuesOf(
      [
        { day: '2026-10-15', views: 4 },
        { day: '2026-10-17', views: 9 },
      ],
      '2026-10-18',
    )
    expect(v).toEqual([4, 0, 9, 0])
    expect(valuesOf([], '2026-10-18')).toEqual([])
  })

  it('names the worst problem of its accounts', () => {
    const c = card('threads', { accounts: [acct('threads', '@a', { error: 'limited' }), acct('threads', '@b', { error: 'denied' })], views: 5 })
    expect(cardView(c, '2026-10-18').problem).toBe('denied')
    expect(cardView({ ...c, accounts: [acct('threads', '@a')] }, '2026-10-18').problem).toBeUndefined()
  })

  it('tells the change only when the period before is known', () => {
    const c = card('instagram', { accounts: [acct('instagram', '@a')], views: 120, previous: 100 })
    expect(cardView(c, '2026-10-18').previous).toBe(100)
    expect(cardView({ ...c, previous: undefined }, '2026-10-18').previous).toBeUndefined()
  })
})

describe('the header row', () => {
  const data: Channels = {
    setup_docs: true,
    days: 30,
    through: '2026-10-18',
    platforms: [card('youtube', { accounts: [acct('youtube', '@a'), acct('youtube', '@b')], views: 12000 }), card('instagram', { accounts: [acct('instagram', '@c')], views: 3000 }), card('threads')],
  }

  it('gives each platform its own views and never a total across them', () => {
    const h = header(cardsOf(data))
    expect(h.views).toEqual([
      { platform: 'youtube', name: 'YouTube', views: 12000 },
      { platform: 'instagram', name: 'Instagram', views: 3000 },
    ])
    expect(Object.keys(h)).toEqual(['views', 'accounts'])
    expect(JSON.stringify(h)).not.toContain('15000')
    expect(h.accounts).toBe(3)
  })

  it('keeps the platforms in their order whatever order the server sent', () => {
    const swapped = { ...data, platforms: [...data.platforms].reverse() }
    expect(cardsOf(swapped).map((c) => c.platform)).toEqual(['youtube', 'instagram', 'threads'])
  })

  it('asks again soon only while an account has not been read', () => {
    expect(waiting(cardsOf(data))).toBe(false)
    const fresh = { ...data, platforms: [card('youtube', { accounts: [acct('youtube', '@a')] })] }
    expect(waiting(cardsOf(fresh))).toBe(true)
  })
})

describe('coming back from a platform', () => {
  it('says it connected and forgets the address parts', () => {
    expect(flashOf('?channel=youtube&connected=1&x=2')).toEqual({ text: 'YouTube connected', kind: 'success', clean: 'x=2' })
  })
  it("says why it did not in its own words, never the platform's", () => {
    expect(flashOf('?channel=threads&channel_error=denied')?.kind).toBe('error')
    expect(flashOf('?channel=threads&channel_error=whatever')?.text).toBe('Connecting did not work. Try again.')
  })
  it('says nothing for an ordinary address', () => {
    expect(flashOf('?x=1')).toBeNull()
    expect(flashOf('')).toBeNull()
  })
})

describe('an account that must be connected again', () => {
  it('shows no number rather than a zero', () => {
    const c = card('youtube', { accounts: [acct('youtube', '@a', { error: 'expired' })] })
    expect(cardView(c, '2026-10-18').state).toBe('unknown')
    expect(waiting(cardsOf({ days: 30, setup_docs: true, through: '2026-10-18', platforms: [c] }))).toBe(false)
  })
})

describe('who may connect', () => {
  it('is said from the roles that hold the action', () => {
    expect(whoCan(['owner'])).toBe('an owner')
    expect(whoCan(['owner', 'admin'])).toBe('an owner or admin')
    expect(whoCan(['owner', 'admin', 'editor'])).toBe('an owner, admin or editor')
    expect(whoCan(['member'])).toBe('a member')
    expect(whoCan([])).toBe('someone with access')
  })
})
