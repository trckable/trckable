import { describe, expect, it } from 'vitest'
import { say } from './words'
import { figureOf } from './figure'
import { settle } from './settle'
import type { Pin } from './pins'

const spike = (visitors: number, referrer = 'google.com', id = 'spike:2026-09-26T00:00'): Pin => ({ id, kind: 'spike', score: 90, day: '2026-09-26', filters: [{ dim: 'referrer', value: referrer }], showDay: true, n: { visitors, referrer } })
const money = (n: number) => `$${n}`

describe('one number for one moment', () => {
  it('the card is read again from what the chart says now', () => {
    const opened = { pins: [spike(1536)], at: 0 }
    const now = [spike(1955)]
    const settled = settle(opened, now)
    expect(settled.pins[0]).toBe(now[0])
    expect(figureOf(settled.pins[0], money).n).toBe(1955)
    expect(say(settled.pins[0], money).line).toContain('1,955')
  })

  it('every place that writes a spike says the count the pin holds', () => {
    const pin = spike(1955)
    expect(say(pin, money).line).toContain('1,955 visitors')
    expect(say(pin, money).big).toBe('1,955 visitors')
    const fig = figureOf(pin, money)
    expect(fig.n).toBe(1955)
    expect(fig.fmt?.(fig.n ?? 0)).toBe('1,955')
  })

  it('a pin the chart no longer has stays as it was opened', () => {
    const opened = { pins: [spike(1536), spike(40, 'x.com', 'spike:other')], at: 0 }
    const settled = settle(opened, [spike(1955)])
    expect(settled.pins[0].n.visitors).toBe(1955)
    expect(settled.pins[1]).toBe(opened.pins[1])
  })

  it('nothing changes while the chart has not answered, or says the same', () => {
    const opened = { pins: [spike(1536)], at: 0 }
    expect(settle(opened, null)).toBe(opened)
    expect(settle(opened, [opened.pins[0]])).toBe(opened)
  })
})
