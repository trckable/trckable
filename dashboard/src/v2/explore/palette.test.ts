import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Report, Site } from '../../lib/api'

const openExplore = vi.hoisted(() => vi.fn<(tab: string, filters?: unknown[]) => void>())
vi.mock('./open', () => ({ openExplore }))
vi.mock('../../lib/url', () => ({ navigate: vi.fn(), setView: vi.fn() }))
vi.mock('../../features/live/switchView', () => ({ switchTab: vi.fn() }))

import { paletteItems } from './palette'

const data = { current: { dims: { referrer: [{ value: 'news.ycombinator.com', visitors: 5 }], country: [{ value: 'DE', visitors: 4 }], device: [{ value: 'mobile', visitors: 3 }] } } } as unknown as Report
const site = { id: 's', domain: 'a.example', name: 'A' } as Site

describe('the palette', () => {
  beforeEach(() => openExplore.mockClear())

  it('opens Explore with the filter on, so the chip shows and every table is narrowed', () => {
    const items = paletteItems({ sites: [site], site, data, here: 'briefing', domainOf: (s) => s.domain })
    for (const word of ['source', 'country']) items.find((i) => i.title.toLowerCase().includes(`filter · ${word}`))?.run()
    items.find((i) => i.title.endsWith('mobile'))?.run()
    expect(openExplore.mock.calls.map((c) => c[1])).toEqual([[{ dim: 'referrer', value: 'news.ycombinator.com' }], [{ dim: 'country', value: 'DE' }], [{ dim: 'device', value: 'mobile' }]])
    expect(openExplore.mock.calls.every((c) => c[0] === 'overview')).toBe(true)
  })

  it('offers Peek before Create', () => {
    const items = paletteItems({ sites: [site], site, data, here: 'briefing', onAsk: () => undefined, onGoal: () => undefined, domainOf: (s) => s.domain })
    expect(items[0].kind).toBe('peek')
    expect(items[1].title).toContain('Create')
  })
})
