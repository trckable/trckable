// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import AccountItems from './AccountItems'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('the avatar menu', () => {
  it('holds the person, Profile, the theme, Shortcuts and Sign out, in that order, and nothing else', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<AccountItems profile={{ email: 'a@b.c', name: 'Ada' } as never} v={0} go={(fn) => fn} />))
    expect(host.firstElementChild?.className).toBe('menu-who')
    const rows = [...host.querySelectorAll('[role=menuitem], [role=menuitemradio]')].map((e) => (e.getAttribute('role') === 'menuitemradio' ? 'Theme' : (e.textContent ?? '').slice(0, 9)))
    expect(rows).toEqual(['Profile', 'Theme', 'Theme', 'Theme', 'Shortcuts', 'Sign out'])
    act(() => root.unmount())
    host.remove()
  })
})
