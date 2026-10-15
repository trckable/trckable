// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Filter, Row } from '../../lib/api'
import { pickedHost, shortHost, split } from '../../lib/domainSwitch'
import { DomainSwitch } from './DomainSwitch'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const row = (value: string, visitors: number): Row => ({ value, visitors })
const two = [row('trckable.com', 90), row('docs.trckable.com', 10)]
const many = [row('trckable.com', 50), row('docs.trckable.com', 40), row('blog.trckable.com', 30), row('app.trckable.com', 20), row('status.trckable.com', 10)]

let root: Root
let host: HTMLDivElement
const onPick = vi.fn()

function draw(seen: Row[] | null, filters: Filter[] = [], narrow = false, loaded = true) {
  act(() => root.render(<DomainSwitch seen={seen} loaded={loaded} filters={filters} site="trckable.com" narrow={narrow} onPick={onPick} />))
}
const radios = () => [...host.querySelectorAll<HTMLElement>('[role=radio]')]

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
  it('five or more domains keep three buttons', () => {
    expect(split(many).shown).toHaveLength(3)
    expect(split(many).rest).toHaveLength(2)
    expect(split(two).rest).toHaveLength(0)
  })
  it('only a single "is" filter counts as picked', () => {
    expect(pickedHost([{ dim: 'hostname', value: 'a' }])).toBe('a')
    expect(pickedHost([{ dim: 'hostname', op: 'not', value: 'a' }])).toBeNull()
    expect(pickedHost([])).toBeNull()
  })
})

describe('DomainSwitch', () => {
  it('shows nothing for one domain', () => {
    draw(null)
    expect(host.textContent).toBe('')
  })
  it('shows All and each domain, All on', () => {
    draw(two)
    expect(radios().map((r) => r.textContent)).toEqual(['All', 'trckable.com', 'docs'])
    expect(radios()[0].getAttribute('aria-checked')).toBe('true')
    expect(radios()[2].title).toContain('docs.trckable.com')
  })
  it('a click picks the full domain and All clears', () => {
    draw(two)
    act(() => radios()[2].click())
    expect(onPick).toHaveBeenLastCalledWith('docs.trckable.com')
    draw(two, [{ dim: 'hostname', value: 'docs.trckable.com' }])
    expect(radios()[2].getAttribute('aria-checked')).toBe('true')
    act(() => radios()[0].click())
    expect(onPick).toHaveBeenLastCalledWith(null)
  })
  it('keeps the list while the filter hides the other domains', () => {
    draw(two)
    draw(null, [{ dim: 'hostname', value: 'docs.trckable.com' }])
    expect(radios()).toHaveLength(3)
  })
  it('after a deep link it offers All and the picked domain', () => {
    draw(null, [{ dim: 'hostname', value: 'docs.trckable.com' }])
    expect(radios().map((r) => r.textContent)).toEqual(['All', 'docs'])
  })
  it('more than four: three buttons and a More menu', () => {
    draw(many)
    expect(radios()).toHaveLength(4)
    expect(host.querySelector('.dom-menu')?.textContent).toBe('More')
  })
  it('a phone gets one chip', () => {
    draw(two, [], true)
    expect(radios()).toHaveLength(0)
    expect(host.querySelector('.dom-menu')?.textContent).toBe('All domains')
    draw(two, [{ dim: 'hostname', value: 'docs.trckable.com' }], true)
    expect(host.querySelector('.dom-menu')?.textContent).toBe('docs')
  })
})
