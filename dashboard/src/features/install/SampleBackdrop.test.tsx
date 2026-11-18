// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { SampleBackdrop } from './SampleBackdrop'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('the setup backdrop', () => {
  it('is decoration: hidden from readers', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<SampleBackdrop />))
    expect(host.querySelector('[data-testid="sample-backdrop"]')?.getAttribute('aria-hidden')).toBe('true')
    act(() => root.unmount())
    host.remove()
  })
})
