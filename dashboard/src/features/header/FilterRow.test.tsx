// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Filter } from '../../lib/api'
import FilterRow from './FilterRow'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const calls = { flip: vi.fn(), remove: vi.fn(), save: vi.fn(), clear: vi.fn() }

function draw(filters: Filter[], views = false) {
  act(() =>
    root.render(
      <FilterRow
        filters={filters}
        dimLabel={(d) => ({ country: 'Country', device: 'Device', channel: 'Channel' })[d] ?? d}
        valueLabel={(_, v) => v}
        onRemove={calls.remove}
        onFlip={calls.flip}
        onClear={calls.clear}
        onSave={calls.save}
        views={views ? { list: [{ id: 's1', name: 'DACH', query: 'f=country%3ADE&f=country%3AAT&f=device%21%3AMobile', created_at: 1 }], current: '', onOpen: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() } : undefined}
      />,
    ),
  )
}
// A chip's parts sit apart by the row's gap: read them with a space between.
const chips = () => [...host.querySelectorAll('.chip:not(.more)')].map((c) => [...c.children].map((p) => p.textContent?.trim()).filter(Boolean).join(' '))
const button = (name: RegExp) => [...host.querySelectorAll('button')].find((b) => name.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))

beforeEach(() => {
  vi.restoreAllMocks()
  Object.values(calls).forEach((c) => c.mockClear())
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the filter chips', () => {
  it('say one dimension\'s values as any of, in one chip', () => {
    draw([{ dim: 'country', value: 'DE' }, { dim: 'country', value: 'AT' }])
    expect(chips()).toEqual(['Country is DE or AT'])
  })
  it('say is not, and keep different dimensions apart', () => {
    draw([{ dim: 'device', op: 'not', value: 'Mobile' }, { dim: 'country', value: 'DE' }])
    expect(chips()).toEqual(['Device is not Mobile', 'Country is DE'])
  })
  it('turn is into is not when the word is pressed', () => {
    draw([{ dim: 'country', value: 'DE' }, { dim: 'country', value: 'AT' }])
    act(() => button(/Country is: change to is not/)?.click())
    expect(calls.flip).toHaveBeenCalledWith({ dim: 'country', op: 'is', values: ['DE', 'AT'] })
  })
  it('remove the whole set with the ×, under the old words', () => {
    draw([{ dim: 'channel', value: 'Direct' }])
    act(() => button(/^Remove filter Channel is Direct$/)?.click())
    expect(calls.remove).toHaveBeenCalledWith({ dim: 'channel', op: 'is', values: ['Direct'] })
  })
  it('offer Save view as an icon, for one filter or several', () => {
    draw([{ dim: 'channel', value: 'Direct' }])
    act(() => button(/^Save view$/)?.click())
    expect(calls.save).toHaveBeenCalledOnce()
    draw([{ dim: 'country', value: 'DE' }, { dim: 'country', value: 'AT' }])
    expect(button(/^Save view$/)).toBeTruthy()
  })
  it('fold the chips that do not fit into +N more, and list them all there', () => {
    // A row 300 px wide, each chip 120 px: one chip and the +N chip fit.
    const row = { clientWidth: 300 }
    const sizes = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.matches('[data-chip]')) return 120
      return this.matches('.chip.more.icon') ? 36 : 84
    })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => row.clientWidth)
    draw([{ dim: 'channel', value: 'Direct' }, { dim: 'country', value: 'DE' }, { dim: 'device', value: 'Mobile' }])
    expect(chips()).toHaveLength(1)
    expect(button(/^\+2 more$/)).toBeTruthy()
    act(() => button(/^\+2 more$/)?.click())
    expect(host.querySelectorAll('.menu-row')).toHaveLength(3)
    sizes.mockRestore()
  })
})
