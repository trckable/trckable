// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { AllTools } from './AllTools'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('All sites header', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  // /all had a header with the site list and nothing at its end: no avatar menu.
  it('ends with the same avatar menu a site page has', () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never
    window.fetch = (() => new Promise(() => {})) as never
    const host = document.createElement('div')
    document.body.append(host)
    act(() => createRoot(host).render(<AllTools />))
    expect(host.querySelector('.header-tools.quiet .account-btn')).not.toBeNull()
  })
})
