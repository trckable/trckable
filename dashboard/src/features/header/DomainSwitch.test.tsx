// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Filter, Row } from '../../lib/api'
import { pickedHost, shortHost } from '../../lib/domainSwitch'
import { DomainSwitch } from './DomainSwitch'
import { DomainRows, domainLabel } from '../../v2/ui/DomainRows'
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
  it('publishes the control; the header says nothing until a domain is picked', () => {
    draw(two)
    expect(domainLabel((current() as DomainControl))).toBeNull()
    draw(two, [{ dim: 'hostname', value: 'docs.trckable.com' }])
    expect(domainLabel((current() as DomainControl))).toBe('docs')
    act(() => root.unmount())
    expect(current()).toBeNull()
    root = createRoot(host)
  })
  it('the list has All domains, then each domain busiest first; a click picks the full domain', () => {
    draw(many, [{ dim: 'hostname', value: 'docs.trckable.com' }])
    const close = vi.fn()
    act(() => root.render(<DomainRows c={current() as DomainControl} close={close} />))
    const items = [...host.querySelectorAll<HTMLElement>('[role=menuitemradio]')]
    expect(items.map((r) => r.textContent?.replace(/\d+$/, ''))).toEqual(['All domains', 'trckable.com', 'docs', 'blog', 'app', 'status'])
    expect(items[2].getAttribute('aria-checked')).toBe('true')
    expect(host.querySelector('input[type=search]')).toBeNull()
    act(() => items[3].click())
    expect(onPick).toHaveBeenLastCalledWith('blog.trckable.com')
    expect(close).toHaveBeenCalled()
  })
  it('more than eight domains bring a search, eight do not', () => {
    const lots = Array.from({ length: 9 }, (_, i) => row(`d${i}.trckable.com`, 100 - i))
    draw(lots)
    act(() => root.render(<DomainRows c={current() as DomainControl} close={() => {}} />))
    expect(host.querySelector('input[type=search]')).not.toBeNull()
    draw(lots.slice(0, 8))
    act(() => root.render(<DomainRows c={current() as DomainControl} close={() => {}} />))
    expect(host.querySelector('input[type=search]')).toBeNull()
  })
  it('ticks the one picked and shows each domain with its count', () => {
    draw(many, [{ dim: 'hostname', value: 'docs.trckable.com' }])
    act(() => root.render(<DomainRows c={current() as DomainControl} close={() => {}} />))
    const on = host.querySelectorAll('[aria-checked=true]')
    expect(on).toHaveLength(1)
    expect(on[0].querySelector('svg')).not.toBeNull()
    expect(on[0].querySelector('.now')?.textContent).toBe('40')
  })
})
