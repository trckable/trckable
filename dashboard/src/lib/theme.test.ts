// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let reduced = false
vi.mock('./motion', () => ({ reducedMotion: () => reduced }))

import { applyTheme } from './theme'
import { FADE_MS, switchTheme as change } from './themeSwitch'

const switchTheme = (t: string) => change(t, applyTheme)

const root = () => document.documentElement
/** The browser's own function, put where a test can see it. */
const viewTransitions = (fn: unknown) => Object.assign(document, { startViewTransition: fn })

beforeEach(() => {
  vi.useFakeTimers()
  reduced = false
  root().removeAttribute('data-theme')
  root().removeAttribute('data-theme-switch')
})
afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'startViewTransition')
})

describe('changing the theme', () => {
  it('without View Transitions: colours ease for the length of the switch only, then it is taken off', () => {
    switchTheme('light')
    expect(root().dataset.theme).toBe('light')
    expect(root().dataset.themeSwitch).toBe('fade')
    vi.advanceTimersByTime(FADE_MS - 1)
    expect(root().dataset.themeSwitch).toBe('fade')
    vi.advanceTimersByTime(2)
    expect(root().dataset.themeSwitch).toBeUndefined()
    // System is no attribute at all.
    switchTheme('system')
    expect(root().dataset.theme).toBeUndefined()
  })

  it('with View Transitions: the page changes inside one, and the mark goes when it has finished', async () => {
    let finish = () => {}
    const finished = new Promise<void>((resolve) => (finish = resolve))
    const start = vi.fn((update: () => void) => {
      update()
      return { finished }
    })
    viewTransitions(start)
    switchTheme('dark')
    expect(start).toHaveBeenCalledTimes(1)
    expect(root().dataset.theme).toBe('dark')
    expect(root().dataset.themeSwitch).toBe('view')
    finish()
    await finished
    await Promise.resolve()
    expect(root().dataset.themeSwitch).toBeUndefined()
  })

  it('with a transition the browser skips, the mark still goes', async () => {
    const finished = Promise.reject(new Error('skipped'))
    viewTransitions((update: () => void) => (update(), { finished }))
    switchTheme('light')
    await finished.catch(() => undefined)
    await Promise.resolve()
    expect(root().dataset.theme).toBe('light')
    expect(root().dataset.themeSwitch).toBeUndefined()
  })

  it('with reduced motion: at once, no transition, no mark', () => {
    reduced = true
    const start = vi.fn()
    viewTransitions(start)
    switchTheme('dark')
    expect(root().dataset.theme).toBe('dark')
    expect(root().dataset.themeSwitch).toBeUndefined()
    expect(start).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(root().dataset.themeSwitch).toBeUndefined()
  })
})
