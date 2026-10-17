// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Verified } from '../../lib/api'
import { SiteSeal } from './SiteSeal'
import { VerifiedPill } from './VerifiedPill'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const on: Verified = {
  sources: [
    { kind: 'gsc', ok: true, since: 1, checked: 2, detail: '' },
    { kind: 'payments', provider: 'stripe', ok: true, since: 1, checked: 2, detail: '' },
  ],
}
const off: Verified = { sources: on.sources.map((s) => ({ ...s, ok: false })) }

let root: Root
let host: HTMLDivElement
const draw = (el: React.ReactElement) => act(() => root.render(el))

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the seal', () => {
  it('names the badges that work', () => {
    draw(<VerifiedPill verified={on} site={{ id: 's', domain: 'a.com' }} />)
    expect(host.querySelector('.vf-pill')?.textContent).toContain('Verified · Payments, Search')
  })

  it('counts only the working ones', () => {
    draw(<VerifiedPill verified={{ sources: [...on.sources.slice(0, 1), ...off.sources.slice(1)] }} />)
    expect(host.querySelector('.vf-pill-text')?.textContent).toBe('Verified · Search')
  })

  it('is not there while nothing works, or nothing is known: no sources, no seal', () => {
    draw(<VerifiedPill verified={off} />)
    expect(host.querySelector('.vf-pill')).toBeNull()
    draw(<VerifiedPill />)
    expect(host.querySelector('.vf-pill')).toBeNull()
    draw(<VerifiedPill verified={off} seal />)
    expect(host.querySelector('.vf-sealbtn')).toBeNull()
  })

  it('is a small seal with a tooltip on the site’s avatar, and opens the panel on click', async () => {
    draw(<VerifiedPill verified={on} seal />)
    const seal = host.querySelector<HTMLButtonElement>('.vf-sealbtn')
    expect(seal?.title).toBe('Verified · Payments, Search')
    expect(seal?.querySelector('.vf-pill-text')).toBeNull()
    act(() => seal?.click())
    for (let i = 0; i < 40 && !document.querySelector('.vf-panel'); i++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25))
      })
    expect(document.querySelector('.vf-panel')).not.toBeNull()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
  })

  it('opens the panel on click for a reader, and Escape closes it', async () => {
    draw(<VerifiedPill verified={on} viewer />)
    act(() => host.querySelector<HTMLButtonElement>('.vf-pill')?.click())
    // The panel is a chunk of its own: it arrives a moment after the click.
    for (let i = 0; i < 40 && !document.querySelector('.vf-panel'); i++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25))
      })
    expect(document.querySelector('.vf-panel')?.textContent).toContain('These numbers are real')
    expect(document.querySelectorAll('.vf-row')).toHaveLength(2)
    // A reader is offered nothing to connect.
    expect(document.querySelector('.vf-connect')).toBeNull()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('.vf-panel')).toBeNull()
  })
})

describe('the badges', () => {
  it('puts a small seal beside a site only while one of its sources works', () => {
    draw(<SiteSeal verified={on} />)
    expect(host.querySelector('.vf-seal-dot')).not.toBeNull()
    draw(<SiteSeal verified={off} />)
    expect(host.querySelector('.vf-seal-dot')).toBeNull()
  })
})
