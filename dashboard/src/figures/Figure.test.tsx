// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Figure } from './Figure'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const draw = (el: React.ReactElement) => act(() => root.render(el))
const width = (px: number) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: px >= Number(/min-width: (\d+)px/.exec(q)?.[1] ?? 0),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('Figure', () => {
  it('is neither drawn nor loaded below its minimum width', () => {
    width(390)
    draw(<Figure name="rack" minWidth={641} />)
    expect(host.querySelector('[data-figure]')).toBeNull()
  })
  it('is drawn at and above its minimum width', () => {
    width(1440)
    draw(<Figure name="rack" minWidth={641} />)
    expect(host.querySelector('[data-figure="rack"]')).not.toBeNull()
  })
  it('the logic board says when every check has passed, and only then', () => {
    width(1440)
    draw(<Figure name="logic" done />)
    expect(host.querySelector('[data-figure="logic"][data-done]')).not.toBeNull()
    expect(host.querySelector('.tkf-done')).not.toBeNull()
    draw(<Figure name="logic" />)
    expect(host.querySelector('[data-done]')).toBeNull()
  })
})
