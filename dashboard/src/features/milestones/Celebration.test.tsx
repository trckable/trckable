// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Milestone } from '../../lib/api'

const reduced = true
vi.mock('../../lib/motion', () => ({ reducedMotion: () => reduced, useTween: (n: number) => n }))

import { Celebration } from './Celebration'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const m: Milestone = { kind: 'visitors', step: '10000', value: 10000, day: '2026-09-21', created_at: 0, new: true, shared: false }
let root: Root
let host: HTMLDivElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('a milestone reached', () => {
  it('is a side card with what was reached, the card to share and Share', () => {
    const share = vi.fn()
    const close = vi.fn()
    vi.useFakeTimers()
    act(() => root.render(<Celebration m={m} site="tkb_x" onShare={share} onClose={close} />))
    const card = document.body.querySelector('.side-card')
    expect(card?.textContent).toContain('New milestone')
    expect(card?.textContent).toContain('10,000')
    expect(card?.textContent).toContain('visitors')
    expect(card?.querySelector('.side-ghost')).not.toBeNull() // a milestone is the one kind that has the ghost in its corner
    // The picture is asked for once the page has had its moment (the first load asks for nothing it does not need).
    expect(card?.querySelector('img')?.getAttribute('src')).toBeNull()
    act(() => void vi.advanceTimersByTime(1600))
    expect(card?.querySelector('img')?.getAttribute('src')).toBe('/api/v1/sites/tkb_x/milestones/visitors/10000/card?format=svg&theme=dark')
    vi.useRealTimers()
    act(() => (card?.querySelector('.btn.primary') as HTMLButtonElement).click())
    expect(share).toHaveBeenCalledTimes(1)
    act(() => (card?.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click())
    expect(close).toHaveBeenCalledTimes(1)
  })
})
