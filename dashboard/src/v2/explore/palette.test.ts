import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Report, Site } from '../../lib/api'

const openExplore = vi.hoisted(() => vi.fn<(tab: string, filters?: unknown[]) => void>())
vi.mock('./open', () => ({ openExplore }))
vi.mock('../../lib/url', () => ({ navigate: vi.fn(), setView: vi.fn() }))
vi.mock('../../lib/theme', () => ({ THEMES: ['system', 'dark', 'light'], setTheme: vi.fn() }))
vi.mock('../../lib/signOut', () => ({ signOut: vi.fn() }))
vi.mock('../../lib/settings', async (orig) => ({ ...(await orig<object>()), openSettings: vi.fn() }))
vi.mock('../../features/live/switchView', () => ({ switchTab: vi.fn() }))
const account = vi.hoisted(() => ({ openAccount: vi.fn() }))
vi.mock('../../lib/account', () => account)
const lang = vi.hoisted(() => ({ chooseLang: vi.fn(), chosen: () => 'auto' }))
vi.mock('../../i18n/choose', () => lang)
const features = vi.hoisted(() => ({ openFeatures: vi.fn() }))
vi.mock('../../features/hub/openFeatures', () => features)
const shortcuts = vi.hoisted(() => ({ openShortcuts: vi.fn() }))
vi.mock('../../components/ShortcutsHost', () => shortcuts)
vi.mock('../../components/toastBus', () => ({ toast: vi.fn() }))
vi.mock('../../lib/installApp', () => ({ install: vi.fn(), isInstalled: () => false }))
vi.mock('../../lib/pwa', () => ({ offer: { get: () => null } }))

import * as me from '../../lib/me'
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

  it('refreshes every number of the site from a row of its own', () => {
    const bus = new EventTarget()
    vi.stubGlobal('window', bus)
    const seen = vi.fn()
    bus.addEventListener('trckable:refresh', seen)
    paletteItems({ sites: [site], site, data, here: 'briefing', domainOf: (s) => s.domain }).find((i) => i.title === 'Refresh the numbers')?.run()
    vi.unstubAllGlobals()
    expect(seen).toHaveBeenCalledOnce()
  })

  it('finds settings, alerts, share, the theme and sign out by their words', () => {
    const items = paletteItems({ sites: [site], site, data, here: 'briefing', domainOf: (s) => s.domain })
    const find = (word: string) => items.filter((i) => `${i.title} ${i.also ?? ''}`.toLowerCase().includes(word)).map((i) => i.title)
    expect(find('settings')).toContain('Settings · Alerts')
    expect(find('alerts')).toEqual(['Settings · Alerts'])
    expect(find('share')).toEqual(['Settings · Sharing'])
    expect(find('dark')).toEqual(expect.arrayContaining(['Theme · Dark']))
    expect(find('sign out')).toEqual(['Sign out'])
    expect(find('privacy')).toContain('Settings · Data & privacy')
  })

  it('leaves the account and the settings to a shared page’s owner', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    const items = paletteItems({ sites: [site], site, data, here: 'briefing', domainOf: (s) => s.domain })
    expect(items.some((i) => i.title.startsWith('Settings') || i.title === 'Sign out')).toBe(false)
    vi.restoreAllMocks()
  })

  it('finds what the avatar menu gave up: Profile, Language, Features, Shortcuts and the own-visits choice', () => {
    vi.stubGlobal('navigator', { userAgent: 'x', maxTouchPoints: 0 })
    const items = paletteItems({ sites: [site], site, data, here: 'briefing', domainOf: (s) => s.domain })
    vi.unstubAllGlobals()
    const by = (title: string) => items.find((i) => i.title === title)
    by('Profile')?.run()
    expect(account.openAccount).toHaveBeenCalledWith('profile')
    by('Language · Deutsch')?.run()
    expect(lang.chooseLang).toHaveBeenCalledWith('de')
    by('Features')?.run()
    expect(features.openFeatures).toHaveBeenCalled()
    by('Shortcuts')?.run()
    expect(shortcuts.openShortcuts).toHaveBeenCalled()
    expect(by('Exclude this browser')).toBeDefined()
    expect(items.some((i) => i.title === 'Install app')).toBe(false) // no offer, not iOS: nowhere to install from
  })

  it('adds a build’s own rows to the Account group', () => {
    const extra = { title: 'Email notifications', kind: 'action', group: 'Account', run: vi.fn() }
    const items = paletteItems({ sites: [site], site, data, here: 'briefing', extra: [extra], domainOf: (s) => s.domain })
    expect(items).toContain(extra)
  })

  it('offers Peek before Create', () => {
    const items = paletteItems({ sites: [site], site, data, here: 'briefing', onAsk: () => undefined, onGoal: () => undefined, domainOf: (s) => s.domain })
    expect(items[0].kind).toBe('peek')
    expect(items[1].title).toContain('Create')
  })

  it('offers the Mentions page only where Mentions is on', () => {
    const find = () => paletteItems({ sites: [site], site, data, here: 'briefing', domainOf: (s) => s.domain }).find((i) => i.title === 'Mentions' && i.group === 'Go to')
    me.setRole('owner', true)
    expect(find()).toBeTruthy()
    me.setRole('owner', false)
    expect(find()).toBeUndefined()
  })

  it('leaves Live, the Briefing, Explore and the periods out for a site with no verified install', () => {
    const items = paletteItems({ sites: [site], site, data, here: 'briefing', fresh: true, domainOf: (s) => s.domain })
    const titles = items.map((i) => i.title)
    expect(titles).not.toContain('Go to Live')
    expect(titles.some((t) => /briefing|explore|period|filter/i.test(t))).toBe(false)
    expect(items.some((i) => i.title.startsWith('Settings'))).toBe(true)
  })
})
