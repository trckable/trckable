// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ ownDays: vi.fn(() => Promise.resolve({ values: [], days: [] })) }))
vi.mock('../../lib/api', async (orig) => ({ ...(await orig<typeof import('../../lib/api')>()), call: vi.fn(() => Promise.resolve({ icons: [] })) }))
vi.mock('../../lib/motion', async (orig) => ({ ...(await orig<typeof import('../../lib/motion')>()), reducedMotion: () => true }))

import { ClusterList } from './ClusterList'
import { chipsOf } from './kinds'
import { PinCard } from './PinCard'
import { pinsFromMoments } from './pins'
import { say } from './words'
import type { Moment } from '../story/moments'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const money = (n: number) => `$${n}`
const site = { id: 's1', timezone: 'UTC' }
const today = new Date().toISOString().slice(0, 10)
const surge = (referrer: string, text: string, hour: string): Moment => ({ t: `${today}T${hour}`, kind: 'surge', factor: 2.4, visitors: 33, referrer, text })
const [facebook, google] = pinsFromMoments([surge('l.facebook.com', 'Facebook', '16:00'), surge('www.google.com', 'Google', '17:00')], true)

describe('a surge as a card', () => {
  it('has a header, a body and a footer, and says the one source in every text', () => {
    act(() =>
      root.render(
        <PinCard id="why" asked closeLabel="Close" pin={facebook} site={site} series={[]} money={money} onClose={vi.fn()} actions={<button type="button" className="btn">{'See it'}</button>} />,
      ),
    )
    const card = document.body.querySelector('aside.side-card') as HTMLElement
    const [head, body, foot] = [...card.children].filter((c) => c.matches('header, .side-body, footer'))
    expect(head.textContent).toContain('Busier than usual')
    expect(head.textContent).toContain('today 16:00')
    expect(head.querySelector('.side-card-x')).not.toBeNull()
    expect(body.querySelector('.side-card-title')?.textContent).toBe('33visitors')
    expect(foot.querySelector('.btn')?.textContent).toBe('See it')
    // One context line: the multiple and the source's chip, and no other line naming a source.
    const sub = body.querySelector('.side-sub')?.textContent ?? ''
    expect(sub).toBe('2.4× the usual·mostly fromLl.facebook.com')
    expect(card.textContent).not.toMatch(/google/i)
    // Every text of the pin names that source: its line, its filter and its chip.
    expect(say(facebook, money).line).toBe('Surge from Facebook')
    expect(facebook.filters).toEqual([{ dim: 'referrer', value: 'l.facebook.com' }])
    expect(chipsOf(facebook)).toEqual([{ host: 'l.facebook.com' }])
  })

  it('lists another source that landed beside it under its own label, not as a line of the card', () => {
    act(() => root.render(<ClusterList pins={[facebook, google]} at={0} money={money} onPick={vi.fn()} />))
    expect(host.querySelector('.why-label')?.textContent).toBe('Also around then')
    expect(host.querySelector('li > button')?.textContent).toBe('Surge from Google')
  })
})
