import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Sales } from './Sales'
import type { XCtx } from '../ctx'
import type { Sales as Model } from '../types'

const x = { kind: '', limit: 50, money: (n: number) => `$${n / 100}`, site: { verified: false }, setKind: () => {}, showAll: () => {} } as unknown as XCtx
const d: Model = {
  state: 'ok',
  sales: [
    { kind: 'new', label: 'New customers', from: '', country: '', device: '', when: 'Today', amt: 12000 },
    { kind: 'renewal', label: 'Renewals', from: '', country: '', device: '', when: 'Today', amt: 21800 },
  ],
}

describe('Sales', () => {
  it('heads the list with no count that its lines do not carry, and nets exactly its lines', () => {
    const html = renderToStaticMarkup(<Sales x={x} d={d} />)
    expect(html).toContain('All sales')
    expect(html).not.toMatch(/\d+ sales/)
    expect(html).toContain('$338 net')
  })
})
