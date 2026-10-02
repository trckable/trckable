// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Milestone } from '../../lib/api'

let reduced = false
vi.mock('../../lib/motion', () => ({ reducedMotion: () => reduced }))

import { Celebration, SPARKS } from './Celebration'

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
    expect(card?.textContent).toContain('10,000 visitors')
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

  it('has the ghost celebrate once, and not at all with reduced motion', () => {
    reduced = false
    act(() => root.render(<Celebration m={m} site="s" onShare={() => {}} onClose={() => {}} />))
    expect(document.body.querySelector('.ms-party')).not.toBeNull()
    expect(document.body.querySelector('.ms-party')?.getAttribute('aria-hidden')).toBe('true')
    act(() => root.unmount())
    root = createRoot(host)
    reduced = true
    act(() => root.render(<Celebration m={m} site="s" onShare={() => {}} onClose={() => {}} />))
    expect(document.body.querySelector('.ms-party')).toBeNull()
    expect(document.body.querySelector('.side-card')).not.toBeNull()
    reduced = false
  })

  it('keeps its celebration under a second and a half', async () => {
    const css = (await import('node:fs')).readFileSync('src/features/milestones/Celebration.css', 'utf8')
    const hop = Number(/animation: ms-hop ([\d.]+)s/.exec(css)?.[1])
    const spark = (/animation: ms-spark ([\d.]+)s [^;]*?calc\(([\d.]+)s \+ var\(--i\) \* ([\d.]+)s\)/.exec(css) ?? []).slice(1).map(Number)
    const lastSpark = spark[0] + spark[1] + (SPARKS - 1) * spark[2]
    expect(hop).toBeLessThanOrEqual(1.5)
    expect(lastSpark).toBeLessThanOrEqual(1.5)
  })
})
