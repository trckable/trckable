// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SideCard } from './SideCard'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const cards = () => [...document.body.querySelectorAll('.side-card')]
const draw = (ui: React.ReactNode) => {
  act(() => root.render(ui))
}
const card = (id: string, onClose = () => undefined) => (
  <SideCard key={id} id={id} label={'Card ' + id} closeLabel="Close" title={'Title ' + id} onClose={onClose} actions={<button type="button">{'Go ' + id}</button>}>
    <p>{'Body ' + id}</p>
  </SideCard>
)

describe('the side card', () => {
  beforeEach(() => {
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
})
