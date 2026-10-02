// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SideCard, type SideCardProps } from './SideCard'

let reduced = true
vi.mock('../../lib/motion', () => ({ reducedMotion: () => reduced }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const cards = () => [...document.body.querySelectorAll('.side-card')]
const draw = (ui: React.ReactNode) => {
  act(() => root.render(ui))
}
const card = (id: string, onClose = () => undefined, asked = false) => (
  <SideCard key={id} id={id} asked={asked} label={'Card ' + id} closeLabel="Close" title={'Title ' + id} onClose={onClose} actions={<button type="button">{'Go ' + id}</button>}>
    <p>{'Body ' + id}</p>
  </SideCard>
)

describe('the side card', () => {
  beforeEach(() => {
    reduced = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('draws its title, body and actions outside the page, labelled, with a close', () => {
    draw(card('a'))
    expect(host.textContent).toBe('') // never in the page's own flow
    const [el] = cards()
    expect(el?.getAttribute('aria-label')).toBe('Card a')
    expect(el?.textContent).toContain('Title a')
    expect(el?.textContent).toContain('Body a')
    expect(el?.textContent).toContain('Go a')
    expect(el?.querySelector('button[aria-label="Close"]')).not.toBeNull()
  })

  it('the close button closes it', () => {
    const close = vi.fn()
    draw(card('a', close))
    act(() => (document.body.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click())
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('Escape closes it from inside the card or from the page, but not from another field', () => {
    const close = vi.fn()
    draw(card('a', close))
    const esc = () => act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    esc()
    expect(close).toHaveBeenCalledTimes(1)
    const other = document.createElement('input')
    document.body.append(other)
    other.focus()
    esc()
    expect(close).toHaveBeenCalledTimes(1)
    other.remove()
    ;(document.body.querySelector('.side-card button') as HTMLButtonElement).focus()
    esc()
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('shows one at a time: the next waits until the first is gone', () => {
    draw(
      <>
        {card('a')}
        {card('b')}
      </>,
    )
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Card a'])
    draw(card('b'))
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Card b'])
    draw(null)
    expect(cards()).toHaveLength(0)
  })

  it('a card someone asked for takes the slot from one that came up by itself, which comes back after', () => {
    draw(card('a'))
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Card a'])
    draw(
      <>
        {card('a')}
        {card('b', undefined, true)}
      </>,
    )
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Card b'])
    draw(card('a'))
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Card a'])
  })

  it('two asked-for cards queue like any other: the second does not push out the first', () => {
    draw(
      <>
        {card('a', undefined, true)}
        {card('b', undefined, true)}
      </>,
    )
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Card a'])
  })

  it('with motion it springs out first, and then it is closed', () => {
    reduced = false
    vi.useFakeTimers()
    const close = vi.fn()
    draw(card('a', close))
    act(() => (document.body.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click())
    expect(close).not.toHaveBeenCalled()
    expect(document.body.querySelector('.side-card.leaving')).not.toBeNull()
    act(() => void vi.advanceTimersByTime(250))
    expect(close).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  describe('what it is, and a deck of several', () => {
    const rich = (o: Partial<SideCardProps> = {}) => (
      <SideCard
        id="rich"
        label="Spike"
        closeLabel="Close"
        title="816 visitors"
        onClose={() => undefined}
        actions={<button type="button">{'Show Sep 28'}</button>}
        kind={{ icon: <svg data-icon="up" />, label: 'Traffic spike', tint: 'var(--money)' }}
        when={{ text: 'yesterday', title: 'Sat, Sep 28' }}
        {...o}
      />
    )
    const deck = (index: number, count: number, onNext = () => undefined, onPrev = () => undefined) => ({ index, count, onNext, onPrev, prevLabel: 'Previous', nextLabel: 'Next', position: `${index + 1} of ${count}` })

    it('shows its kind with its own tint, when it happened with the date for a tooltip, and the ghost only when asked', () => {
      draw(rich())
      const el = cards()[0] as HTMLElement
      expect(el.querySelector('.side-kind')?.textContent).toContain('Traffic spike')
      expect(el.style.getPropertyValue('--tint')).toBe('var(--money)')
      const when = el.querySelector('.side-when')
      expect(when?.textContent).toBe('yesterday')
      expect(when?.getAttribute('title')).toBe('Sat, Sep 28')
      expect(when?.getAttribute('aria-label')).toBe('yesterday, Sat, Sep 28')
      expect(el.querySelector('.side-ghost')).toBeNull()
      draw(rich({ ghost: true }))
      expect(cards()[0].querySelector('.side-ghost')).not.toBeNull()
    })

    it('a deck shows dots, the cards behind it and ← → buttons; one alone shows none', () => {
      draw(rich({ deck: deck(1, 3) }))
      const el = cards()[0]
      expect(el.querySelectorAll('.side-dots i')).toHaveLength(3)
      expect(el.querySelector('.side-dots i.on')).toBe(el.querySelectorAll('.side-dots i')[1])
      expect(el.querySelector('.side-dots')?.getAttribute('aria-label')).toBe('2 of 3')
      expect(document.body.querySelectorAll('.side-peek')).toHaveLength(2)
      expect(el.querySelector('button[aria-label="Previous"]')).not.toBeNull()
      draw(rich({ deck: deck(0, 1) }))
      expect(document.body.querySelectorAll('.side-peek')).toHaveLength(0)
      expect(cards()[0].querySelector('.side-dots')).toBeNull()
    })

    it('the first has no way back and the last no way on', () => {
      draw(rich({ deck: deck(0, 2) }))
      expect((cards()[0].querySelector('button[aria-label="Previous"]') as HTMLButtonElement).disabled).toBe(true)
      draw(rich({ deck: deck(1, 2) }))
      expect((cards()[0].querySelector('button[aria-label="Next"]') as HTMLButtonElement).disabled).toBe(true)
    })

    it('the buttons, the arrows (with focus in the card) and a swipe turn it', () => {
      const next = vi.fn()
      const prev = vi.fn()
      draw(rich({ deck: deck(1, 3, next, prev) }))
      const el = cards()[0] as HTMLElement
      act(() => (el.querySelector('button[aria-label="Next"]') as HTMLButtonElement).click())
      expect(next).toHaveBeenCalledTimes(1)
      const key = (k: string) => act(() => void (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })))
      // Focus on the page: the arrows are the page's own (they step the period).
      ;(document.activeElement as HTMLElement).blur()
      act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
      expect(prev).not.toHaveBeenCalled()
      ;(el.querySelector('button[aria-label="Close"]') as HTMLButtonElement).focus()
      key('ArrowLeft')
      expect(prev).toHaveBeenCalledTimes(1)
      key('ArrowRight')
      expect(next).toHaveBeenCalledTimes(2)
      // A swipe left goes on, a swipe right goes back; a small move is neither.
      const swipe = (from: number, to: number) => {
        act(() => void el.dispatchEvent(new MouseEvent('pointerdown', { clientX: from, bubbles: true })))
        act(() => void el.dispatchEvent(new MouseEvent('pointerup', { clientX: to, bubbles: true })))
      }
      swipe(200, 100)
      expect(next).toHaveBeenCalledTimes(3)
      swipe(100, 200)
      expect(prev).toHaveBeenCalledTimes(2)
      swipe(100, 110)
      expect(next).toHaveBeenCalledTimes(3)
      expect(prev).toHaveBeenCalledTimes(2)
    })
  })
})
