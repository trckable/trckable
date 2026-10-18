// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The wizard that adds a site is shut to a viewer whatever opens it: the first
// run, a key, and an old link (?add=site), which is read before anyone is known.
async function shown(role: string, open: boolean, search = '') {
  vi.resetModules()
  window.history.replaceState(null, '', '/x' + search)
  const me = await import('./me')
  const acc = await import('./account')
  me.setRole(role)
  let value = false
  function Probe() {
    value = acc.useAddSite()
    return null
  }
  const root = createRoot(document.createElement('div'))
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => root.render(<Probe />))
  if (open) act(() => acc.openAddSite())
  act(() => root.unmount())
  return value
}

describe('the add-a-site wizard', () => {
  afterEach(() => vi.resetModules())

  it('opens for an owner', async () => {
    expect(await shown('owner', true)).toBe(true)
  })

  it('stays shut for a viewer who opens it', async () => {
    expect(await shown('viewer', true)).toBe(false)
  })

  it('stays shut for a viewer who comes by an old link', async () => {
    expect(await shown('viewer', false, '?add=site')).toBe(false)
    expect(await shown('owner', false, '?add=site')).toBe(true)
  })
})
