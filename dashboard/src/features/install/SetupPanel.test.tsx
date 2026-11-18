// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { SetupPanel } from './SetupPanel'
import type { InstallCheckHandle } from './useInstallCheck'
import { MIN_MS } from './useCheckRun'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const site = { id: 's1', domain: 'shop.test', timezone: 'UTC' } as Site
const handle = (over: Partial<InstallCheckHandle>): InstallCheckHandle => ({ state: { phase: 'idle' }, start: () => {}, at: null, ...over })

let root: Root
let host: HTMLDivElement
const draw = (check: InstallCheckHandle, onCheck: () => void) =>
  act(() => root.render(<SetupPanel site={site} check={check} stage="waiting" onCheck={onCheck} />))
const button = () => host.querySelector('.ist-check') as HTMLButtonElement

describe('the install status Check now', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
  })

  it('runs a check on a press, shows it running for a moment, then says what it found', () => {
    const onCheck = vi.fn()
    draw(handle({}), onCheck)
    expect(button().textContent).toBe('Check now')
    act(() => button().click())
    expect(onCheck).toHaveBeenCalledTimes(1)
    expect(button().textContent).toBe('Checking…')
    // A second press while it runs is ignored.
    act(() => button().click())
    expect(onCheck).toHaveBeenCalledTimes(1)
    // The answer comes at once; the result waits for the minimum time.
    draw(handle({ state: { phase: 'done', result: { found: 'site' } as never }, at: Date.UTC(2026, 10, 18, 11, 43) }), onCheck)
    expect(button().textContent).toBe('Checking…')
    act(() => void vi.advanceTimersByTime(MIN_MS))
    expect(host.querySelector('.ist-result')?.textContent).toContain('No visit yet')
    expect(host.querySelector('.ist-result')?.textContent).toContain('11:43')
  })

  it('says so when the check fails', () => {
    draw(handle({}), () => {})
    act(() => button().click())
    draw(handle({ state: { phase: 'failed' }, at: 5 }), () => {})
    act(() => void vi.advanceTimersByTime(MIN_MS))
    expect(host.querySelector('.ist-result')?.textContent).toContain('Couldn’t check')
  })
})
