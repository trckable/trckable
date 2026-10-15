// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Result, Row } from '../../lib/api'
import type { CardsCtx } from './ctx'
import { PagesPanel } from './Breakdowns'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const row = (value: string, visitors: number): Row => ({ value, visitors })
const HOSTS = [row('example.com', 5), row('docs.example.com', 2)]

const ctx = (hosts: number, addFilter = vi.fn(), filters: { dim: string; value: string }[] = []) =>
  ({
    site: { id: 's1' },
    query: { filters },
    full: false,
    shared: false,
    rows: 12,
    scrubbing: false,
    mods: null,
    loading: false,
    visitors: 5,
    perDay: () => true,
    cur: { hosts, dims: {} } as unknown as Result,
    dims: (d: string) => (d === 'hostname' ? HOSTS : []),
    addFilter,
  }) as unknown as CardsCtx

let root: Root
let host: HTMLDivElement
const mount = (node: React.ReactNode) => act(() => root.render(node))
const tabs = () => [...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent)

describe('the Domains tab of the Pages card', () => {
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('shows with two domains, and not with one', () => {
    mount(<PagesPanel c={ctx(2)} />)
    expect(tabs()).toContain('Domains')
    mount(<PagesPanel c={ctx(0)} />)
    expect(tabs()).not.toContain('Domains')
  })

  it('stays while the dashboard is filtered by a domain', () => {
    mount(<PagesPanel c={ctx(0, vi.fn(), [{ dim: 'hostname', value: 'docs.example.com' }])} />)
    expect(tabs()).toContain('Domains')
  })

  it('has a one-line tip, and a click on a row filters by that domain', () => {
    const addFilter = vi.fn()
    mount(<PagesPanel c={ctx(2, addFilter)} />)
    const tab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === 'Domains')
    if (!tab) throw new Error('no Domains tab')
    expect(tab.title).not.toBe('')
    act(() => tab.click())
    act(() => host.querySelectorAll<HTMLElement>('.bl-row')[1].click())
    expect(addFilter).toHaveBeenCalledWith('hostname', 'docs.example.com')
  })
})
