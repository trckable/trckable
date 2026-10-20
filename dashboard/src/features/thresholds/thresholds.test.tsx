// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from '../../lib/api'
import { reachable, ruleOf } from './model'
import { ThresholdRule } from './Rule'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const alert = (patch: Partial<Alert>): Alert => ({ id: 'a', site_id: 's', kind: 'threshold', enabled: true, target: 'mailto:a@b.co', threshold: 0, last_fired: 0, created_at: 0, ...patch })
const field = (label: string) => host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLSelectElement
const type = (el: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(() => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
const leave = (el: HTMLElement) => act(() => void el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))

describe('the target alert', () => {
  it('starts as ten sales in a day and keeps what an alert holds', () => {
    expect(ruleOf()).toEqual({ metric: 'sales', period: 'day', threshold: 10 })
    expect(ruleOf(alert({ metric: 'visitors', period: 'month', threshold: 1000 }))).toEqual({ metric: 'visitors', period: 'month', threshold: 1000 })
    expect(ruleOf(alert({ metric: 'bogus', period: '', threshold: -1 }))).toEqual({ metric: 'sales', period: 'day', threshold: 10 })
  })

  it('only takes a number that can be met', () => {
    expect(reachable('sales', 5)).toBe(true)
    expect(reachable('sales', 2.5)).toBe(false)
    expect(reachable('revenue', 2.5)).toBe(true)
    expect(reachable('visitors', 0)).toBe(false)
    expect(reachable('visitors', Number.NaN)).toBe(false)
  })

  it('saves a choice at once and a number when it is finished', () => {
    const save = vi.fn()
    act(() => root.render(<ThresholdRule alert={alert({ metric: 'sales', period: 'day', threshold: 10 })} onSave={save} />))
    type(field('Over which period'), 'week')
    expect(save).toHaveBeenLastCalledWith({ metric: 'sales', period: 'week', threshold: 10 })
    const num = field('The number to reach')
    type(num, '25')
    expect(save).toHaveBeenCalledTimes(1)
    leave(num)
    expect(save).toHaveBeenLastCalledWith({ metric: 'sales', period: 'day', threshold: 25 })
  })

  it('puts back a number that cannot be met', () => {
    const save = vi.fn()
    act(() => root.render(<ThresholdRule alert={alert({ metric: 'sales', threshold: 10 })} onSave={save} />))
    const num = field('The number to reach')
    type(num, '2.5')
    leave(num)
    expect(save).not.toHaveBeenCalled()
    expect(num.value).toBe('10')
  })
})
