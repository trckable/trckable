// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { V2ExtrasContext } from '../v2/slots'
import AccountItems from './AccountItems'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('the account menu order', () => {
  it('puts a build’s its own row directly below Profile, before notifications, language and sign out', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const plan = (
      <button type="button" role="menuitem" data-test="plan">
        {'Billing'}
      </button>
    )
    act(() =>
      root.render(
        <V2ExtrasContext.Provider value={{ menuAfterProfile: () => plan }}>
          <AccountItems profile={{ email: 'a@b.c', name: 'Ada' } as never} v={0} go={(fn) => fn} />
        </V2ExtrasContext.Provider>,
      ),
    )
    const items = [...host.querySelectorAll('[role=menuitem]')]
    const at = (test: (e: Element) => boolean) => items.findIndex(test)
    const plan_ = at((e) => e.getAttribute('data-test') === 'plan')
    const account = items.findIndex((e) => e === items[plan_ - 1])
    const signOut = items.length - 1
    expect(plan_).toBeGreaterThan(0)
    expect(account).toBe(plan_ - 1) // the row above it is the account's own (Profile)
    expect(plan_).toBeLessThan(signOut)
    // The person's identity comes before everything: nothing of the build's is above it.
    expect(host.firstElementChild?.getAttribute('data-test')).not.toBe('plan')
    act(() => root.unmount())
    host.remove()
  })

  it('takes a build’s row between the person and Profile, its name and role for the person, and its Sign out', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let out = 0
    const mark = (id: string) => (
      <button type="button" role="menuitem" data-test={id}>
        {id}
      </button>
    )
    act(() =>
      root.render(
        <V2ExtrasContext.Provider value={{ menuBeforeProfile: () => mark('before'), menuAfterProfile: () => mark('after'), personName: 'Ada L', personRole: 'Billing', signOut: () => { out++ } }}>
          <AccountItems profile={{ email: 'a@b.c', name: '' } as never} v={0} go={(fn) => fn} />
        </V2ExtrasContext.Provider>,
      ),
    )
    const items = [...host.querySelectorAll('[role=menuitem]')]
    const at = (id: string) => items.findIndex((e) => e.getAttribute('data-test') === id)
    expect(at('before')).toBe(0)
    expect(at('after')).toBe(2)
    expect(host.querySelector('.menu-who-name')?.textContent).toContain('Ada L')
    expect(host.querySelector('.menu-who-name .tag')?.textContent).toBe('Billing')
    act(() => (items[items.length - 1] as HTMLButtonElement).click())
    expect(out).toBe(1)
    act(() => root.unmount())
    host.remove()
  })
})
