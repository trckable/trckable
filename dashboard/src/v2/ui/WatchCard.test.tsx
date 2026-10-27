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
  it('names the topic on its own line and shows the status as the cards’ badge beside it, never inside the name', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<WatchCard onStop={vi.fn()} rows={[{ key: 'goals', topic: 'Goals', gone: true, since: { at: '16:30', delta: '+12', unit: 'people' } }]} />))
    expect(host.querySelector('.wl > b')?.textContent).toBe('Goals')
    expect(host.querySelector('.wrow > .ic-bd')?.textContent).toBe('back to normal')
    expect(host.querySelector('.wl')?.textContent).not.toContain('back to normal')
    act(() => root.unmount())
  })
  it('has no status chip while the card is still among the day’s', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<WatchCard onStop={vi.fn()} rows={[{ key: 'goals', topic: 'Goals', gone: false, since: { at: '16:30', delta: '+12', unit: 'people' } }]} />))
    expect(host.querySelector('.ic-bd')).toBeNull()
    act(() => root.unmount())
  })
})
