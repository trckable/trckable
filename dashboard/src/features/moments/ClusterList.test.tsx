// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClusterList } from './ClusterList'
import type { Pin } from './pins'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const sale = (k: number): Pin => ({ id: `sale:${k}`, kind: 'sale', score: 60, day: '2026-09-10', filters: [], showDay: true, n: { count: k + 1, amount: 100 } })
const mile = (family: 'visitors' | 'pageviews' | 'countries', value: number): Pin => ({ id: `milestone:${family}:${value}`, kind: 'milestone', score: 75, day: '2026-09-10', filters: [], showDay: true, n: { family, value } })

let root: Root
let host: HTMLDivElement
const draw = (pins: Pin[], onPick = () => undefined) => act(() => root.render(<ClusterList pins={pins} at={0} money={(m) => `$${m}`} onPick={onPick} />))
const one = (css: string): HTMLButtonElement => {
  const el = host.querySelector<HTMLButtonElement>(css)
  if (!el) throw new Error(`no ${css}`)
  return el
}
const lines = () => [...host.querySelectorAll('li > button')].map((b) => b.textContent)

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the list beside the open moment', () => {
  it('lists three, then "+N more" that opens the rest in place', () => {
    draw(Array.from({ length: 9 }, (_, k) => sale(k)))
    expect(host.querySelectorAll('li > button:not(.why-all)')).toHaveLength(3)
    const more = one('.why-all')
    expect(more.textContent).toBe('+5 more')
    act(() => more.click())
    expect(host.querySelectorAll('li > button')).toHaveLength(8)
    expect(host.querySelector('.why-all')).toBeNull()
  })

  it('milestones are one row, the list on tap, each a pick', () => {
    const pick = vi.fn()
    draw([sale(0), mile('visitors', 100), mile('countries', 10), mile('countries', 25), mile('pageviews', 1)], pick)
    expect(lines()).toEqual(['4 milestones'])
    const group = one('.why-group > button')
    expect(group.getAttribute('aria-expanded')).toBe('false')
    act(() => group.click())
    expect(group.getAttribute('aria-expanded')).toBe('true')
    const items = host.querySelectorAll<HTMLButtonElement>('.why-group ul button')
    expect(items).toHaveLength(4)
    act(() => items[2].click())
    expect(pick).toHaveBeenCalledWith(3)
  })

  it('nothing to list when it is alone', () => {
    draw([sale(0)])
    expect(host.querySelector('.why-more')).toBeNull()
  })
})
