import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { V2ExtrasContext } from '../slots'
import { SectionPage } from './SectionPage'
import type { XCtx } from './ctx'
import type { DataCtx } from './data/useExplore'

vi.mock('./data/useExplore', () => ({ useTab: () => ({ state: 'ok', data: { say: 'Pricing doubled.', rows: [{ name: '/pricing', v: 40 }] } }) }))
vi.mock('./SectionBody', () => ({ SectionBody: () => <p>{'numbers'}</p> }))

const x = { query: { from: '2026-10-01', to: '2026-10-30' }, filters: [], limit: 5, showAll: () => {} } as unknown as XCtx
const page = () => <SectionPage section="links" tab="outbound" x={x} c={{} as DataCtx} onRead={() => {}} />

describe('a card and Peek', () => {
  it('offers Why? once it has numbers, in a build with Peek', () => {
    const html = renderToStaticMarkup(<V2ExtrasContext.Provider value={{ askPeekNow: vi.fn() }}>{page()}</V2ExtrasContext.Provider>)
    expect(html).toContain('data-ask-peek')
  })
  it('asks with the card numbers once, and the strip stays closed until pressed', () => {
    const html = renderToStaticMarkup(<V2ExtrasContext.Provider value={{ askPeekNow: vi.fn() }}>{page()}</V2ExtrasContext.Provider>)
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('data-why-line')
  })
  it('shows nothing in a build with no Peek', () => {
    expect(renderToStaticMarkup(page())).not.toContain('data-ask-peek')
  })
})
