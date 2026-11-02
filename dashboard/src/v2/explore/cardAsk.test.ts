import { describe, expect, it } from 'vitest'
import { cardAsk } from './cardAsk'

describe('a card asks Peek', () => {
  it('with its name, period, filters, line and top numbers', () => {
    const rows = [1, 2, 3, 4].map((i) => ({ name: `/p${i}`, v: i * 10 }))
    const q = cardAsk('Pages', '2026-10-01', '2026-10-30', [{ dim: 'country', value: 'DE' }], { say: 'Pricing doubled.', rows })
    for (const part of ['Pages', '2026-10-01', '2026-10-30', 'country = DE', 'Pricing doubled.', '/p3: 30']) expect(q).toContain(part)
    expect(q).not.toContain('/p4')
  })
  it('still asks when the card has no table', () => {
    expect(cardAsk('Flow', '2026-10-01', '2026-10-30', undefined, null)).toContain('Flow')
  })
})
