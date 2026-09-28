import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Milestone } from '../../lib/api'
import { Moment } from './Moment'

const m = (o: Partial<Milestone>): Milestone => ({ kind: 'visitors', step: '10000', value: 10000, day: '2026-09-21', created_at: 0, new: true, shared: false, ...o })

describe('the moment', () => {
  it('is one line: the ghost, the number, the label, Share and close', () => {
    const html = renderToStaticMarkup(<Moment m={m({})} onShare={() => {}} onClose={() => {}} />)
    expect(html).toContain('tkb-ghost')
    expect(html).toContain('visitors')
    expect(html).toContain('Share')
    expect(html).toContain('aria-label="Dismiss"')
    expect(html).not.toContain('money')
  })
  it('draws money in the money colour, and a one-off without a number', () => {
    const html = renderToStaticMarkup(<Moment m={m({ kind: 'first_sale', step: '1', value: 1 })} />)
    expect(html).toContain('ms-moment money')
    expect(html).toContain('First sale')
    expect(html).not.toContain('ms-num')
    expect(html).not.toContain('Share')
  })
})
