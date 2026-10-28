// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { FailedCell } from './FailedCell'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function draw(blocked: number, broken: number): HTMLElement {
  const el = document.createElement('div')
  act(() => createRoot(el).render(<FailedCell blocked={blocked} broken={broken} />))
  return el
}

describe('the blocked / failed cell', () => {
  it('shows the refused and the broken added up, in red, with the split as its title', () => {
    const cell = draw(15, 8).querySelector('span')
    expect(cell?.textContent).toBe('23')
    expect(cell?.style.color).toBe('var(--mk-red)')
    expect(cell?.title).toBe('15 blocked by your server or CDN · 8 broken pages')
  })
  it('is a plain dash when nothing went wrong', () => {
    const el = draw(0, 0)
    expect(el.textContent).toBe('–')
    expect(el.querySelector('span')).toBeNull()
  })
})
