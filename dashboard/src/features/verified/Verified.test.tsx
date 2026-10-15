// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Verified } from '../../lib/api'
import { SiteSeal } from './SiteSeal'
import { SourceChip } from './SourceChip'
import { VerifiedPill } from './VerifiedPill'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const on: Verified = {
  sources: [
    { kind: 'snippet', ok: true, since: 1, checked: 2, detail: '' },
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

describe('the seal in the header', () => {
  it('says how many sources work', () => {
    draw(<VerifiedPill verified={on} site={{ id: 's', domain: 'a.com' }} />)
    expect(host.querySelector('.vf-pill')?.textContent).toContain('Verified · 3')
  })

  it('counts only the working ones', () => {
    draw(<VerifiedPill verified={{ sources: [...on.sources.slice(0, 1), ...off.sources.slice(1)] }} />)
    expect(host.querySelector('.vf-pill-text')?.textContent).toBe('Verified · 1')
  })

  it('is not there while nothing works, or nothing is known', () => {
    draw(<VerifiedPill verified={off} />)
    expect(host.querySelector('.vf-pill')).toBeNull()
    draw(<VerifiedPill />)
    expect(host.querySelector('.vf-pill')).toBeNull()
  })

  it('opens the panel on click, and Escape closes it', async () => {
    draw(<VerifiedPill verified={on} viewer />)
    act(() => host.querySelector<HTMLButtonElement>('.vf-pill')?.click())
    // The panel is a chunk of its own: it arrives a moment after the click.
    for (let i = 0; i < 40 && !document.querySelector('.vf-panel'); i++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25))
      })
    expect(document.querySelector('.vf-panel')?.textContent).toContain('These numbers are real')
    expect(document.querySelectorAll('.vf-row')).toHaveLength(3)
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('.vf-panel')).toBeNull()
  })
})

describe('the badges', () => {
  it('names the source behind a card, and drops it when the source stops working', () => {
    draw(<SourceChip verified={on} slot="visitors" />)
    expect(host.querySelector('.vf-chip')?.textContent).toContain('Live')
    draw(<SourceChip verified={on} slot="revenue" />)
    expect(host.querySelector('.vf-chip')?.textContent).toContain('Stripe')
    draw(<SourceChip verified={on} slot="search" />)
    expect(host.querySelector('.vf-chip')?.textContent).toContain('Search Console')
    draw(<SourceChip verified={off} slot="visitors" />)
    expect(host.querySelector('.vf-chip')).toBeNull()
  })

  it('puts a small seal beside a site only while one of its sources works', () => {
    draw(<SiteSeal verified={on} />)
    expect(host.querySelector('.vf-seal-dot')).not.toBeNull()
    draw(<SiteSeal verified={off} />)
    expect(host.querySelector('.vf-seal-dot')).toBeNull()
  })
})
