// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Row } from '../../lib/api'
import { publishDomains } from '../../lib/domainControl'
import { DomainPicker } from './DomainPicker'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const row = (value: string, visitors: number): Row => ({ value, visitors })
let root: Root
let host: HTMLDivElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => publishDomains(null))
  act(() => root.unmount())
  host.remove()
})

describe('the domain picker after the site name', () => {
  it('shows nothing for one domain or none', () => {
    act(() => root.render(<DomainPicker />))
    expect(host.textContent).toBe('')
    act(() => publishDomains({ seen: [row('a.com', 5)], filters: [], site: 'a.com', onPick: () => undefined }))
    expect(host.textContent).toBe('')
  })
  it('says All domains for two or more, opens a list on a press and says the one picked', () => {
    act(() => root.render(<DomainPicker />))
    const seen = Array.from({ length: 10 }, (_, i) => row(`s${i}.a.com`, 100 - i))
    act(() => publishDomains({ seen, filters: [], site: 'a.com', onPick: () => undefined }))
    const btn = host.querySelector<HTMLButtonElement>('.dompick-btn')
    expect(btn?.textContent).toBe('All domains')
    expect(host.querySelector('[role=menuitemradio]')).toBeNull()
    act(() => btn?.click())
    expect(host.querySelectorAll('[role=menuitemradio]')).toHaveLength(11) // All domains and ten
    expect(host.querySelector('input[type=search]')).not.toBeNull()
    act(() => publishDomains({ seen, filters: [{ dim: 'hostname', value: 's3.a.com' }], site: 'a.com', onPick: () => undefined }))
    expect(host.querySelector('.dompick-now')?.textContent).toBe('s3')
  })
})
