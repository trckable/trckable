// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { need } from '../../lib/need'
import type { Pin } from './pins'

const toast = vi.fn<(text: string, kind: string, action?: { label: string; run: () => void }) => void>()
const setView = vi.fn<(patch: object) => void>()
vi.mock('../../components/Toast', () => ({ toast: (t: string, k: string, a?: { label: string; run: () => void }) => toast(t, k, a) }))
vi.mock('../../lib/url', async (orig) => ({ ...(await orig<typeof import('../../lib/url')>()), setView: (p: object) => setView(p) }))
vi.mock('../../lib/motion', () => ({ reducedMotion: () => true }))

import { HIT } from './focus'
import { seeIt } from './OneThing'

const referrer: Pin = { id: 'new_referrer:google.com', kind: 'referrer', score: 60, day: '2026-09-27', filters: [{ dim: 'referrer', value: 'google.com' }], showDay: false, n: { name: 'google.com', visitors: 312 } }
const site = { timezone: 'UTC' }
const scroll = vi.fn()

beforeEach(() => {
  toast.mockClear()
  setView.mockClear()
  document.body.innerHTML = '<div class="overview-chart"></div>'
  // happy-dom has no layout: scrolling is a no-op to watch.
  scroll.mockClear()
  need(document.querySelector('.overview-chart')).scrollIntoView = scroll
  history.replaceState(null, '', '/demo.example?view=data')
})
afterEach(() => vi.useRealTimers())

describe('See it', () => {
  it('applies the filter, says what is shown with a way to clear it, brings the chart into view and lights the marker', () => {
    vi.useFakeTimers()
    const lit = vi.fn<(id: string) => void>()
    window.addEventListener(HIT, (e) => lit((e as CustomEvent<string>).detail))
    seeIt(referrer, site)
    expect(setView).toHaveBeenCalledTimes(1)
    expect(setView.mock.calls[0][0]).toMatchObject({ filters: [{ dim: 'referrer', value: 'google.com' }] })
    expect(toast).toHaveBeenCalledWith('Showing google.com · Sep 27', 'info', expect.objectContaining({ label: 'Clear' }))
    expect(scroll).toHaveBeenCalled()
    vi.advanceTimersByTime(10)
    expect(lit).toHaveBeenCalledWith('new_referrer:google.com')
  })

  it('says it again when the address is already what it asks for: the toast and the marker are the result', () => {
    history.replaceState(null, '', '/demo.example?view=data&f=referrer%3Agoogle.com')
    vi.useFakeTimers()
    const lit = vi.fn<(id: string) => void>()
    window.addEventListener(HIT, (e) => lit((e as CustomEvent<string>).detail))
    seeIt(referrer, site)
    expect(toast).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10)
    expect(lit).toHaveBeenCalled()
  })

  it('Clear takes the pin\'s filter off the address and keeps the others', () => {
    history.replaceState(null, '', '/demo.example?view=data&f=referrer%3Agoogle.com&f=country%3ADE')
    seeIt(referrer, site)
    const clear = need(toast.mock.calls[0][2])
    setView.mockClear()
    clear.run()
    expect(setView.mock.calls[0][0]).toMatchObject({ filters: [{ dim: 'country', value: 'DE' }] })
  })
})
