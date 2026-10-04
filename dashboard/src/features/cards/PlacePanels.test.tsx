// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Row } from '../../lib/api'
import type { CardsCtx } from './ctx'
import { DevicesPanel, LocationsPanel } from './PlacePanels'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const row = (value: string, visitors: number): Row => ({ value, visitors, sessions: visitors, pageviews: visitors, bounce_rate: 0.4 })
const DIMS: Record<string, Row[]> = {
  country: [row('DE', 5)],
  language: [row('de', 4), row('en', 1)],
  device: [row('Desktop', 5)],
  browser: [row('Chrome', 5)],
  browser_version: [row('Chrome 130', 3), row('Unknown', 2)],
  os: [row('macOS', 5)],
  screen: [row('≤640', 3), row('1025–1440', 2)],
}

const ctx = (full: boolean, addFilter = vi.fn()) =>
  ({
    site: { id: 's1' },
    full,
    rows: 12,
    mapOn: false,
    money: undefined,
    scrubbing: false,
    loading: false,
    visitors: 5,
    perDay: () => true,
    dims: (d: string) => DIMS[d] ?? [],
    addFilter,
  }) as unknown as CardsCtx

let root: Root
let host: HTMLDivElement
const mount = (node: React.ReactNode) => act(() => root.render(node))
const tabs = () => [...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent)
const tab = (name: string) => {
  const found = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === name)
  if (!found) throw new Error(`no tab called ${name}`)
  return found
}
const rows = () => [...host.querySelectorAll<HTMLElement>('.bl-row')]

describe('the extra tabs of the Devices and Locations cards', () => {
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('Devices has Browser version and Screen in Full', () => {
    mount(<DevicesPanel c={ctx(true)} />)
    expect(tabs()).toEqual(['Devices', 'Browsers', 'Browser version', 'OS', 'Screen'])
  })

  it('Devices keeps its three tabs outside Full', () => {
    mount(<DevicesPanel c={ctx(false)} />)
    expect(tabs()).toEqual(['Devices', 'Browsers', 'OS'])
  })

  it('Locations has Languages in Full, and not outside it', () => {
    mount(<LocationsPanel c={ctx(true)} />)
    expect(tabs()).toContain('Languages')
    mount(<LocationsPanel c={ctx(false)} />)
    expect(tabs()).toEqual([]) // Countries alone is a list, not a row of tabs
  })

  it('a click on a screen bucket filters by it', () => {
    const addFilter = vi.fn()
    mount(<DevicesPanel c={ctx(true, addFilter)} />)
    act(() => tab('Screen').click())
    expect(rows().map((r) => r.querySelector('.bl-text')?.textContent)).toEqual(['≤640', '1025–1440'])
    act(() => rows()[1].click())
    expect(addFilter).toHaveBeenCalledWith('screen', '1025–1440')
  })

  it('a click on a browser version filters by it, and a visit from before versions is Unknown', () => {
    const addFilter = vi.fn()
    mount(<DevicesPanel c={ctx(true, addFilter)} />)
    act(() => tab('Browser version').click())
    expect(rows().map((r) => r.querySelector('.bl-text')?.textContent)).toEqual(['Chrome 130', 'Unknown'])
    act(() => rows()[0].click())
    expect(addFilter).toHaveBeenCalledWith('browser_version', 'Chrome 130')
  })

  it('languages read as names and filter by the code', () => {
    const addFilter = vi.fn()
    mount(<LocationsPanel c={ctx(true, addFilter)} />)
    act(() => tab('Languages').click())
    expect(rows().map((r) => r.querySelector('.bl-text')?.textContent)).toEqual(['German', 'English'])
    act(() => rows()[0].click())
    expect(addFilter).toHaveBeenCalledWith('language', 'de')
  })
})
