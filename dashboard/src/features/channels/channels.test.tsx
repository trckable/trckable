import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChannelCard } from './api'
import { copy } from './copy'
import { cardView, type CardView } from './model'

// Who is signed in is module state: each test starts afresh.
async function fresh(role: string) {
  vi.resetModules()
  const me = await import('../../lib/me')
  me.setRole(role)
  const [section, cardMod] = await Promise.all([import('./ChannelsSection'), import('./ChannelCard')])
  return { ...section, ...cardMod }
}

const raw = (platform: ChannelCard['platform'], extra: Partial<ChannelCard> = {}): ChannelCard => ({ platform, ready: true, accounts: [], monitoring: 0, series: [], ...extra })
const acct = (platform: ChannelCard['platform'], handle: string, error?: string) => ({ id: handle, platform, handle, created_at: 1, last_ok_at: 2, error })
const view = (c: ChannelCard): CardView => cardView(c, '2026-10-18')
const three = [view(raw('youtube')), view(raw('instagram')), view(raw('threads', { ready: false }))]

describe('connecting', () => {
  it('offers an owner a link to each platform the server has keys for, and a disabled one with a way to set it up for the rest', async () => {
    const t = await fresh('owner')
    const html = renderToStaticMarkup(<t.Empty cards={three} />)
    expect(html).toContain('href="/api/v1/channels/youtube/start"')
    expect(html).toContain('href="/api/v1/channels/instagram/start"')
    expect(html).not.toContain('/api/v1/channels/threads/start')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Connect Threads/)
    expect(html).toContain(copy.docs)
  })

  it('offers a viewer nothing to press', async () => {
    const t = await fresh('viewer')
    const html = renderToStaticMarkup(<t.Empty cards={three} />)
    expect(html).not.toContain('<a')
    expect(html).not.toContain('<button')
    expect(html).toContain(copy.viewOnly)
  })
})

describe('the cards', () => {
  beforeEach(() => vi.resetModules())

  it('say how many accounts are watched, with the views and the change', async () => {
    const t = await fresh('owner')
    const c = view(raw('youtube', { accounts: [acct('youtube', '@a'), acct('youtube', '@b')], views: 12345, previous: 10000, series: [{ day: '2026-10-17', views: 5 }] }))
    const html = renderToStaticMarkup(<t.ChannelCardView card={c} reload={() => {}} />)
    expect(html).toContain('Monitoring 2 accounts')
    expect(html).toContain('12,345')
    expect(html).toContain('+23%')
    expect(html).toContain('@a · @b')
  })

  it('wait for the first read instead of showing a zero', async () => {
    const t = await fresh('owner')
    const html = renderToStaticMarkup(<t.ChannelCardView card={view(raw('threads', { accounts: [acct('threads', '@a')] }))} reload={() => {}} />)
    expect(html).toContain(copy.waiting)
    expect(html).not.toContain('class="ch-num"')
  })

  it('ask to connect again when the platform refused, and only an owner can', async () => {
    const c = view(raw('instagram', { accounts: [acct('instagram', '@a', 'denied')], views: 3 }))
    const owner = await fresh('owner')
    const html = renderToStaticMarkup(<owner.ChannelCardView card={c} reload={() => {}} />)
    expect(html).toContain(copy.problem.denied)
    expect(html).toContain('/api/v1/channels/instagram/start')
    const viewer = await fresh('viewer')
    const seen = renderToStaticMarkup(<viewer.ChannelCardView card={c} reload={() => {}} />)
    expect(seen).toContain(copy.problem.denied)
    expect(seen).not.toContain('/start')
    expect(seen).not.toContain('tm-more')
  })

  it('draw a headline per platform and no sum of them', async () => {
    const t = await fresh('owner')
    const cards = [view(raw('youtube', { accounts: [acct('youtube', '@a')], views: 12000 })), view(raw('instagram', { accounts: [acct('instagram', '@b')], views: 3000 }))]
    const html = renderToStaticMarkup(<t.Strip cards={cards} />)
    expect(html).toContain('12K')
    expect(html).toContain('3,000')
    expect(html).not.toContain('15K')
    expect(html).not.toContain('15,000')
  })
})
