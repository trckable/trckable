// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Milestone } from '../../lib/api'

let reduced = true
vi.mock('../../lib/motion', () => ({ reducedMotion: () => reduced, useTween: (n: number) => n }))

import { Celebration, SPARKS } from './Celebration'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const m: Milestone = { kind: 'visitors', step: '10000', value: 10000, day: '2026-09-21', created_at: 0, new: true, shared: false }
const list: Milestone[] = [
  { ...m, step: '1000', value: 1000, day: '2026-09-01', new: false },
  { ...m, step: '100', value: 100, day: '2026-07-01', new: false },
  m,
]
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
  it('is one flat card with the number, a line of context, the card to share, Copy image and Share…', () => {
    const share = vi.fn()
    const close = vi.fn()
    vi.useFakeTimers()
    act(() => root.render(<Celebration m={m} list={list} site="tkb_x" domain="demo.trckable.com" onShare={share} onClose={close} />))
    const card = document.body.querySelector('.side-card')
    expect(card?.textContent).toContain('Milestone · demo.trckable.com')
    expect(card?.textContent).toContain('10,000')
    expect(card?.textContent).toContain('visitors')
    expect(card?.textContent).toContain('3× faster than the last one')
    expect(card?.classList.contains('flat')).toBe(true) // no coloured line on its edge
    expect(card?.querySelector('.side-ghost')).toBeNull() // no mascot on the card
    expect([...(card?.querySelectorAll('.side-card-actions .btn') ?? [])].map((b) => b.textContent)).toEqual(['Copy image', 'Share…'])
    // The picture is asked for once the page has had its moment (the first load asks for nothing it does not need).
    expect(card?.querySelector('img')?.getAttribute('src')).toBeNull()
    act(() => void vi.advanceTimersByTime(1600))
    expect(card?.querySelector('img')?.getAttribute('src')).toBe('/api/v1/sites/tkb_x/milestones/visitors/10000/card?format=svg&theme=dark')
    expect(card?.querySelector('.side-num')?.textContent).toContain('10,000') // the number leads; the picture is the server's, drawn from the same milestone
    vi.useRealTimers()
    act(() => (card?.querySelector('.btn.ms-share') as HTMLButtonElement).click())
    expect(share).toHaveBeenCalledTimes(1)
    act(() => (card?.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click())
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('asks for the picture without the amount of revenue and says how long after the first sale', () => {
    vi.useFakeTimers()
    const rev: Milestone = { kind: 'revenue', step: '1000', value: 1000, currency: 'USD', day: '2026-09-14', created_at: 0, new: true, shared: false }
    const first: Milestone = { kind: 'first_sale', step: '1', value: 1, day: '2026-08-27', created_at: 0, new: false, shared: false }
    act(() => root.render(<Celebration m={rev} list={[first, rev]} site="s" onShare={() => {}} onClose={() => {}} />))
    act(() => void vi.advanceTimersByTime(1600))
    const card = document.body.querySelector('.side-card')
    expect(card?.querySelector('.side-num')?.textContent).toBe('$1,000')
    expect(card?.textContent).toContain('in revenue, 18 days after the first sale')
    // The preview and Copy image follow the toggle's default (off): no amount asked for.
    expect(card?.querySelector('img')?.getAttribute('src')).not.toContain('amount')
    vi.useRealTimers()
  })

  it('has the ghost celebrate once, and not at all with reduced motion', () => {
    reduced = false
    act(() => root.render(<Celebration m={m} site="s" onShare={() => {}} onClose={() => {}} />))
    expect(document.body.querySelector('.ms-party')).not.toBeNull()
    expect(document.body.querySelector('.ms-party')?.getAttribute('aria-hidden')).toBe('true')
    // It stands on the card's top edge: inside the card's deck, never over its buttons.
    expect(document.body.querySelector('.side-deck > .ms-party')).not.toBeNull()
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
