// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WatchCard } from './WatchCard'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
})

describe('a watched line', () => {
  it('names the topic on its own and puts the status under it as a chip, never after it on the same line', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<WatchCard onStop={vi.fn()} rows={[{ key: 'goals', topic: 'Goals', gone: true, since: { at: '16:30', delta: '+12', unit: 'people' } }]} />))
    expect(host.querySelector('.wl b')?.textContent).toBe('Goals')
    expect(host.querySelector('.wl .wst')?.textContent).toBe('back to normal')
    expect(host.querySelector('.wl')?.textContent).not.toContain('·')
    act(() => root.unmount())
  })
  it('has no status chip while the card is still among the day’s', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<WatchCard onStop={vi.fn()} rows={[{ key: 'goals', topic: 'Goals', gone: false, since: { at: '16:30', delta: '+12', unit: 'people' } }]} />))
    expect(host.querySelector('.wst')).toBeNull()
    act(() => root.unmount())
  })
})
