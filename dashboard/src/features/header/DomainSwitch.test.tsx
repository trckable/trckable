// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Filter, Row } from '../../lib/api'
import { pickedHost, shortHost } from '../../lib/domainSwitch'
import { DomainSwitch } from './DomainSwitch'
import { DomainMenu, domainLabel } from './DomainMenu'
import { domainsNow as current, type DomainControl } from '../../lib/domainControl'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const row = (value: string, visitors: number): Row => ({ value, visitors })
const two = [row('trckable.com', 90), row('docs.trckable.com', 10)]
const many = [row('trckable.com', 50), row('docs.trckable.com', 40), row('blog.trckable.com', 30), row('app.trckable.com', 20), row('status.trckable.com', 10)]

let root: Root
let host: HTMLDivElement
const onPick = vi.fn()

function draw(seen: Row[] | null, filters: Filter[] = [], narrow = false) {
  act(() => root.render(<DomainSwitch seen={seen} filters={filters} site="trckable.com" narrow={narrow} onPick={onPick} />))
}

beforeEach(() => {
  onPick.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the words', () => {
  it('short labels drop the site name from a subdomain', () => {
    expect(shortHost('docs.trckable.com', 'trckable.com')).toBe('docs')
    expect(shortHost('trckable.com', 'trckable.com')).toBe('trckable.com')
    expect(shortHost('www.trckable.com', 'www.trckable.com')).toBe('trckable.com')
    expect(shortHost('other.org', 'trckable.com')).toBe('other.org')
  })
  it('only a single "is" filter counts as picked', () => {
    expect(pickedHost([{ dim: 'hostname', value: 'a' }])).toBe('a')
    expect(pickedHost([{ dim: 'hostname', op: 'not', value: 'a' }])).toBeNull()
    expect(pickedHost([])).toBeNull()
  })
})

describe('DomainSwitch and DomainRow', () => {
  it('publishes nothing for one domain', () => {
    draw(null)
    expect(host.textContent).toBe('')
    expect(current()).toBeNull()
  })
  it('publishes the control; the header says All until a domain is picked', () => {
    draw(two)
    expect(domainLabel((current() as DomainControl))).toBe('All')
    draw(two, [{ dim: 'hostname', value: 'docs.trckable.com' }])
    expect(domainLabel((current() as DomainControl))).toBe('docs')
    act(() => root.unmount())
    expect(current()).toBeNull()
    root = createRoot(host)
  })
  it('the dropdown lists All domains, then each domain busiest first; a click picks the full domain', () => {
    const SEEN = many
    const FILT: Filter[] = [{ dim: 'hostname', value: 'docs.trckable.com' }]
    act(() => root.render(<><DomainSwitch seen={SEEN} filters={FILT} site="trckable.com" onPick={onPick} /><DomainMenu /></>))
    const btn = host.querySelector<HTMLElement>('.dom-btn')
    expect(btn?.textContent).toContain('docs')
    act(() => btn?.click())
    const items = [...document.querySelectorAll<HTMLElement>('[role=menuitemradio]')]
    expect(items.map((r) => r.textContent?.replace(/\d+$/, ''))).toEqual(['All domains', 'trckable.com', 'docs', 'blog', 'app', 'status'])
    expect(items[2].getAttribute('aria-checked')).toBe('true')
    expect(document.querySelector('.dom-search')).toBeNull()
    act(() => items[3].click())
    expect(onPick).toHaveBeenLastCalledWith('blog.trckable.com')
  })
  it('more than six domains bring a search', () => {
    const lots = Array.from({ length: 9 }, (_, i) => row(`d${i}.trckable.com`, 100 - i))
    const SEEN = lots
    const FILT: Filter[] = []
    act(() => root.render(<><DomainSwitch seen={SEEN} filters={FILT} site="trckable.com" onPick={onPick} /><DomainMenu /></>))
    act(() => host.querySelector<HTMLElement>('.dom-btn')?.click())
    expect(document.querySelector('.dom-search input')).not.toBeNull()
  })
})
