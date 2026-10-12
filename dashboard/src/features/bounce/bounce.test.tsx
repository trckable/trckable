// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BounceCause, BounceGuide } from '../../lib/apiMore'

const guide = vi.hoisted(() => ({ current: null as BounceGuide | null }))
vi.mock('./useBounceGuide', () => ({ useBounceGuide: () => ({ guide: guide.current, state: guide.current ? 'ready' : 'loading' }) }))

const seen = vi.hoisted(() => ({ page: vi.fn(), speed: vi.fn() }))
vi.mock('./seePage', () => ({ seePage: seen.page, seeSpeed: seen.speed }))

import BounceGuideModal from './BounceGuideModal'
import { fixesOf, topPage } from './fixes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const page: BounceCause = { kind: 'page', label: '/promo', rate: 0.95, share_of_visits: 0.4, was: 0.5 }
const sd: BounceCause = { kind: 'source_device', label: 'Social · Mobile', source: 'Social', device: 'Mobile', rate: 0.9, share_of_visits: 0.3, was: null }
const speed: BounceCause = { kind: 'speed', label: '/promo', rate: 0.95, share_of_visits: 0.4, was: 0.5, lcp_ms: 4100 }
const days = ['2026-09-10', '2026-09-15', '2026-09-20', '2026-09-21'].map((day, i) => ({ day, rate: i < 2 ? 0.5 : 0.9, sessions: 50 }))
const high = (causes: BounceCause[]): BounceGuide => ({ direction: 'high', rate: 0.78, usual: 0.5, sessions: 400, since: '2026-09-20', days, causes })

describe('what to try', () => {
  it('lists only what the causes call for', () => {
    expect(fixesOf([page, sd, speed])).toEqual(['open', 'see', 'links', 'speed'])
    expect(fixesOf([sd])).toEqual(['open'])
    expect(fixesOf([])).toEqual([])
  })
  it('opens the first page a cause names', () => {
    expect(topPage([sd, speed])).toBe('/promo')
    expect(topPage([sd])).toBeNull()
  })
})

describe('the walkthrough', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    localStorage.clear()
    vi.clearAllMocks()
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  const show = (g: BounceGuide, onClose = () => {}, qs = '?days=30') => {
    guide.current = g
    act(() => root.render(<BounceGuideModal site="s1" domain="example.com" qs={qs} onClose={onClose} />))
  }
  const box = () => [...document.querySelectorAll('.bounce-modal')].at(-1) as HTMLElement // a closing dialog may linger in the page
  const text = () => box().textContent ?? ''
  const button = (name: string) => [...box().querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement
  const next = (n = 1) => {
    for (let i = 0; i < n; i++) act(() => button('Next').click())
  }
  const press = (key: string) => act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
  const title = () => box().querySelector('.bg-title')?.textContent

  it('starts with the rate and the daily line, and moves with the buttons and the arrow keys', () => {
    show(high([page, sd, speed]))
    expect(title()).toBe('What happened')
    expect(text()).toContain('78%')
    expect(text()).toContain('1 of 4')
    expect(box().querySelector('.bg-chart svg path.ln')).not.toBeNull()
    expect(text()).toContain('usual ~50%')
    expect(text()).toContain('since')
    expect(button('Back').disabled).toBe(true)
    next()
    expect(title()).toBe('Where they leave')
    press('ArrowRight')
    expect(title()).toBe('Why')
    press('ArrowRight')
    expect(title()).toBe('Fix it')
    expect(text()).toContain('4 of 4')
    press('ArrowRight')
    expect(title()).toBe('Fix it')
    act(() => button('Back').click())
    expect(title()).toBe('Why')
    press('ArrowLeft')
    press('ArrowLeft')
    press('ArrowLeft')
    expect(title()).toBe('What happened')
  })

  it('shows this period against the usual for each cause', () => {
    show(high([page, sd, speed]))
    next()
    expect(box().querySelectorAll('.bg-cause')).toHaveLength(3)
    expect(text()).toContain('95%')
    expect(text()).toContain('50%')
    expect(text()).toContain('Social on Mobile')
    expect(text()).toContain('40% of visits')
    // a row with no usual of its own shows one bar
    expect(box().querySelectorAll('.bg-cause')[1].querySelectorAll('.bg-bar')).toHaveLength(1)
  })

  it('draws one picture for each kind of cause', () => {
    show(high([page]))
    next(2)
    expect(box().querySelector('.bg-frame .bg-addr')?.textContent).toBe('/promo')
    expect(box().querySelector('.bg-gauge')).toBeNull()
    show(high([speed]), () => {}, '?days=7')
    expect(title()).toBe('Why')
    expect(box().querySelector('.bg-gauge .needle')?.textContent).toBe('4.1 s')
    show(high([sd]), () => {}, '?days=8')
    expect(box().querySelector('.bg-device.phone')).not.toBeNull()
    show(high([page, sd, speed]), () => {}, '?days=9')
    expect(box().querySelectorAll('.bg-sub')).toHaveLength(3)
  })

  it('has a list to try, with buttons that go to the page', () => {
    const close = vi.fn()
    show(high([page, sd, speed]), close)
    next(3)
    expect(box().querySelectorAll('.bg-fix')).toHaveLength(4)
    expect(text()).toContain('Make the window narrow')
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    act(() => button('Open').click())
    expect(open).toHaveBeenCalledWith('https://example.com/promo', '_blank', 'noopener,noreferrer')
    open.mockRestore()
    act(() => button('See this page').click())
    expect(seen.page).toHaveBeenCalledWith('example.com', '/promo')
    expect(close).toHaveBeenCalled()
    act(() => button('See speed details').click())
    expect(seen.speed).toHaveBeenCalledWith('example.com', '/promo')
  })

  const boxes = () => [...box().querySelectorAll<HTMLInputElement>('.bg-fix input')]

  it('keeps the ticks in the browser', () => {
    show(high([page]))
    next(3)
    act(() => boxes()[0].click())
    expect(boxes()[0].checked).toBe(true)
    expect(JSON.parse(localStorage.getItem('bounce-tried:s1') ?? '[]')).toEqual(['open'])
    act(() => root.render(null))
    show(high([page]))
    next(3)
    expect(boxes()[0].checked).toBe(true)
  })

  it('still ticks when storage refuses', () => {
    const fail = () => {
      throw new Error('storage is off')
    }
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail)
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail)
    show(high([page]))
    next(3)
    expect(boxes()[0].checked).toBe(false)
    act(() => boxes()[0].click())
    expect(boxes()[0].checked).toBe(true)
    set.mockRestore()
    get.mockRestore()
  })

  it('closes on Done', () => {
    const close = vi.fn()
    show(high([sd]), close)
    next(3)
    act(() => button('Done').click())
    expect(close).toHaveBeenCalled()
  })

  it('has nothing to walk through when it is as usual', () => {
    show({ direction: 'normal', rate: 0.5, usual: 0.5, sessions: 400, days: [], causes: [] })
    expect(text()).toContain('Nothing unusual')
    expect(button('Next')).toBeUndefined()
  })

  it('says it is spread when no cause stands out', () => {
    show(high([]))
    expect(text()).toContain('No single page or source stands out')
    expect(button('Next')).toBeUndefined()
  })
})
