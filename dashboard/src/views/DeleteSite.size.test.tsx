// @vitest-environment happy-dom
// One box per dialog: the step it is on never changes the size class (kit/Modal.css gives each class one fixed height).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/apiMore', async (orig) => ({ ...(await orig<typeof import('../lib/apiMore')>()), more: { deletePreview: () => Promise.resolve({}) } }))

import { DeleteSite } from './DeleteSite'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const site = { id: 's1', domain: 'a-very-long-domain-name-for-a-small-test-site.example.com' } as never

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ''
})

const box = () => document.querySelector('[role="dialog"]') as HTMLElement
const sizeOf = (el: HTMLElement) => [...el.classList].filter((c) => /^modal-(sm|md|lg)$/.test(c)).join()

describe('a dialog keeps its size across steps', () => {
  it('Delete site: the first and the last step are the same size class, and a long domain is ellipsized with its title', async () => {
    act(() => root.render(<DeleteSite site={site} onClose={() => {}} onSites={() => {}} />))
    await act(() => Promise.resolve())
    const first = sizeOf(box())
    expect(first).toBe('modal-md')
    expect(box().querySelector('.modal-title')?.getAttribute('title')).toContain('a-very-long-domain')
    const input = box().querySelector('input') as HTMLInputElement
    // eslint-disable-next-line @typescript-eslint/unbound-method -- React tracks the native setter
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      set?.call(input, 'a-very-long-domain-name-for-a-small-test-site.example.com')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => (Array.from(box().querySelectorAll('button')).find((b) => b.textContent === 'Continue') as HTMLButtonElement).click())
    expect(box().querySelector('.modal-title')?.textContent).toBe('Last check')
    expect(sizeOf(box())).toBe(first)
  })

  it('Add a site: every step of the wizard is one frame, one size', () => {
    const src = readFileSync(join(import.meta.dirname, '../features/install/AddWizard.tsx'), 'utf8')
    expect([...src.matchAll(/size: '(sm|md|lg)'/g)].map((m) => m[1])).toEqual(['lg'])
  })
})
