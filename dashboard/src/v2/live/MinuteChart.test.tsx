// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../features/live/switchView', () => ({ openMinute: vi.fn() }))

import { openMinute } from '../../features/live/switchView'
import { MinuteChart } from './MinuteChart'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.mocked(openMinute).mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const bars = [{ h: 3, z: true, n: 0 }, { h: 50, z: false, n: 5 }, { h: 100, z: false, n: 1 }]
const people = [{ h: 3, z: true, n: 0 }, { h: 60, z: false, n: 3 }, { h: 100, z: false, n: 1 }]
const chart = (mode: 'bars' | 'line') => {
  act(() => root.render(<MinuteChart bars={bars} people={people} mode={mode} total={6} beat={0} minute={1} phone={false} timezone="UTC" label={(ago) => `10:0${2 - ago}`} />))
  return [...host.querySelectorAll<HTMLElement>(mode === 'bars' ? '.mins i' : '.mhits i')]
}
const fire = (el: Element, type: string, init: object = {}) => act(() => void el.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, { bubbles: true, ...init })))
const tip = () => host.querySelector('[role=status]')

describe('the half hour chart tooltip', () => {
  for (const [mode, words] of [['bars', '5 views'], ['line', '3 on the site']] as const) {
    it(`shows the minute and ${mode === 'bars' ? 'its views' : 'the people on the site'} on hover in ${mode}, and hides on leave`, () => {
      const hit = chart(mode)[1]
      fire(hit, 'pointerover', { pointerType: 'mouse' })
      expect(tip()?.textContent).toContain('10:01')
      expect(tip()?.textContent).toContain(words)
      fire(hit, 'pointerout', { pointerType: 'mouse', relatedTarget: document.body })
      expect(tip()).toBeNull()
    })
  }

  it('moves to the next minute with the arrow keys', () => {
    const hits = chart('bars')
    act(() => hits[1].focus())
    act(() => void hits[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(document.activeElement).toBe(hits[2])
  })

  it('a thumb shows the tooltip on the first tap and opens the minute on the second', () => {
    const hit = chart('line')[2]
    fire(hit, 'pointerdown', { pointerType: 'touch' })
    fire(hit, 'click')
    expect(tip()?.textContent).toContain('1 on the site')
    expect(openMinute).not.toHaveBeenCalled()
    fire(hit, 'pointerdown', { pointerType: 'touch' })
    fire(hit, 'click')
    expect(openMinute).toHaveBeenCalledTimes(1)
  })
})
