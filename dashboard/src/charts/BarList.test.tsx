// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BarList } from './BarList'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const items = [
  { key: '/', label: '/', value: 9 },
  { key: '/pricing', label: '/pricing', value: 3 },
]

describe('a row’s own button', () => {
  it('is not there unless the list is given one', () => {
    act(() => root.render(<BarList items={items} dimLabel="Page" />))
    expect(host.querySelector('.bl-act')).toBeNull()
    expect(host.querySelector('.bl-item')).toBeNull()
    expect(host.querySelector('.bl.has-act')).toBeNull()
  })

  it('is one a row, beside the row and not inside it, named for its row, and does not filter', () => {
    const onPick = vi.fn()
    const onAct = vi.fn()
    act(() => root.render(<BarList items={items} dimLabel="Page" onPick={onPick} action={{ icon: <i>{'f'}</i>, label: (k) => `Heatmap of ${k}`, onAct }} />))
    const acts = [...host.querySelectorAll<HTMLButtonElement>('.bl-act')]
    expect(acts.map((a) => a.getAttribute('aria-label'))).toEqual(['Heatmap of /', 'Heatmap of /pricing'])
    // never a button inside a button
    expect(host.querySelector('.bl-row .bl-act')).toBeNull()
    act(() => acts[1].click())
    expect(onAct).toHaveBeenCalledWith('/pricing')
    expect(onPick).not.toHaveBeenCalled()
    act(() => host.querySelectorAll<HTMLButtonElement>('.bl-row')[0].click())
    expect(onPick).toHaveBeenCalledWith('/')
    expect(host.querySelector('.bl.has-act')).not.toBeNull()
  })
})
