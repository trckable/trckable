// @vitest-environment happy-dom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import type { Speed } from './health'

vi.mock('../../lib/permissions', () => ({ can: () => true }))
import { SpeedUptimeCard } from './SpeedUptimeCard'

const site = { id: 's1', domain: 'a.test', timezone: 'UTC', watched_since: 1 } as Site
const up = { pct: 100, days: [] }
const draw = (speed: Speed | null) => renderToStaticMarkup(createElement(SpeedUptimeCard, { site, now: 0, health: { speed, vitalsOn: true, uptime: up, ai: null } }))
const speed = (o: Partial<Speed>): Speed => ({ kind: 'lcp', sec: null, n: 0, people: 0, ...o })

describe('the speed half of the card', () => {
  it('counts the readings so far, with no reason, while few people have visited', () => {
    const html = draw(speed({ n: 0, people: 0 }))
    expect(html).toContain('Speed: 0 of 5 readings so far')
    expect(html).not.toContain('Not every browser reports this')
  })
  it('says why when many people came and few readings did', () => {
    const html = draw(speed({ n: 2, people: 120 }))
    expect(html).toContain('Speed: 2 of 5 readings so far')
    expect(html).toContain('Not every browser reports this')
    expect(html).not.toContain('Collecting')
  })
  it('shows the main figure, with no fallback words, from five readings', () => {
    const html = draw(speed({ sec: 1.8, n: 40, people: 120 }))
    expect(html).toContain('1.8 s')
    expect(html).not.toContain('first content shown')
    expect(html).not.toContain('readings so far')
  })
  it('shows the first-content figure with its label and reason when that is all there is', () => {
    const html = draw(speed({ kind: 'fcp', sec: 2.4, n: 60, people: 120 }))
    expect(html).toContain('2.4 s')
    expect(html).toContain('Page load · first content shown')
    expect(html).toContain('From 60 page views.')
    expect(html).toContain('OK')
  })
})
