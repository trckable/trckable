// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { V2ExtrasContext } from '../slots'
import { WhyBody } from './WhyBody'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

const why = { cause: 'People so far today: 120. The same stretch on the last Fridays: 80, 90.', todo: 'Open Explore.' }
const button = () => host.querySelector<HTMLButtonElement>('[data-ask-peek]')

describe('a Why? text', () => {
  it('shows only the text when the build has no Peek', () => {
    act(() => root.render(<WhyBody why={why} />))
    expect(host.textContent).toContain('People so far today: 120')
    expect(button()).toBeNull()
  })

  it('offers Ask Peek with the question and its numbers when the build has Peek', () => {
    const askPeek = vi.fn()
    act(() =>
      root.render(
        <V2ExtrasContext.Provider value={{ askPeek }}>
          <WhyBody why={why} />
        </V2ExtrasContext.Provider>,
      ),
    )
    expect(button()?.textContent).toBe('Ask Peek')
    act(() => button()?.click())
    expect(askPeek).toHaveBeenCalledWith(`Why is this? ${why.cause}`)
  })
})
