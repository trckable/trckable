// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BounceCause, BounceGuide } from '../../lib/apiMore'

const guide = vi.hoisted(() => ({ current: null as BounceGuide | null }))
vi.mock('./useBounceGuide', () => ({ useBounceGuide: () => ({ guide: guide.current, state: guide.current ? 'ready' : 'loading' }) }))

const seen = vi.hoisted(() => vi.fn())
vi.mock('./seePage', () => ({ seePage: seen }))

import BounceGuideModal from './BounceGuideModal'
import { topPage, triesOf } from './tries'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const page: BounceCause = { kind: 'page', label: '/promo', rate: 0.95, share_of_visits: 0.4, was: 0.5 }
const sd: BounceCause = { kind: 'source_device', label: 'Social · Mobile', source: 'Social', device: 'Mobile', rate: 0.9, share_of_visits: 0.3, was: null }
const speed: BounceCause = { kind: 'speed', label: '/promo', rate: 0.95, share_of_visits: 0.4, was: 0.5, lcp_ms: 4100 }

describe('what to try', () => {
  it('is one line per kind of cause, at most two, in the order of the causes', () => {
    expect(triesOf([page, sd, speed])).toEqual(['page', 'source_device'])
    expect(triesOf([page, speed, page])).toEqual(['page', 'speed'])
    expect(triesOf([])).toEqual([])
  })
  it('opens the first page a cause names', () => {
    expect(topPage([sd, speed])).toBe('/promo')
    expect(topPage([sd])).toBeNull()
  })
})

describe('the popup', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  const show = (g: BounceGuide) => {
    guide.current = g
    act(() => root.render(<BounceGuideModal site="s1" domain="example.com" qs="?days=30" onClose={() => {}} />))
  }
  const box = () => [...document.querySelectorAll('.bounce-modal')].at(-1) as HTMLElement // a closing dialog may linger in the page
  const text = () => box().textContent ?? ''

  it('says the rate, the usual and the causes, with at most two suggestions', () => {
    show({ direction: 'high', rate: 0.78, usual: 0.5, sessions: 400, since: '2026-09-20', causes: [page, sd, speed] })
    expect(text()).toContain('78%')
    expect(text()).toContain('leave after one page · usual ~50%')
    expect(text()).toContain('since')
    expect(text()).toContain('Mostly people from Social on Mobile')
    expect(text()).toContain('95% leave here (usually 50%)')
    expect(box().querySelectorAll('.bg-try li')).toHaveLength(2)
    const go = [...box().querySelectorAll('button')].find((b) => b.textContent === 'See this page')
    act(() => go?.click())
    expect(seen).toHaveBeenCalledWith('example.com', '/promo')
  })

  it('has nothing to fix when it is as usual', () => {
    show({ direction: 'normal', rate: 0.5, usual: 0.5, sessions: 400, causes: [] })
    expect(text()).toContain('Nothing unusual')
    expect([...box().querySelectorAll('button')].some((b) => b.textContent === 'See this page')).toBe(false)
  })
})
