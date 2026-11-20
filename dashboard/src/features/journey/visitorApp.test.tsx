import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { techParts } from './IdentityCard'
import { VisitCard } from './VisitCard'
import { buildStory, type VisitStory } from './model'
import type { JourneyResult } from '../../lib/api'

describe('techParts', () => {
  it('drops "Mobile" when the system is known and ends with how it opened', () => {
    expect(techParts({ device: 'Mobile', browser: 'Safari', os: 'iOS', app: '' })).toEqual(['iOS', 'Safari'])
    expect(techParts({ device: 'Mobile', browser: 'Safari', os: 'iOS', app: 'app' })).toEqual(['iOS', 'In an app'])
    expect(techParts({ device: 'Mobile', browser: 'Safari', os: 'iOS', app: 'instagram' })).toEqual(['iOS', 'Instagram'])
  })
  it('keeps the desktop line as it was, with its browser', () => {
    expect(techParts({ device: 'Desktop', browser: 'Chrome', os: 'macOS', app: '' })).toEqual(['Desktop', 'Chrome', 'macOS'])
  })
  it('keeps the device word when no system is known', () => {
    expect(techParts({ device: 'Tablet', browser: '', os: '', app: '' })).toEqual(['Tablet'])
  })
})

const USD = 'USD'
const data = (app?: string): JourneyResult => ({
  journey: { visitor: '1', visits: [{ start: '2026-09-27T12:00:00Z', end: '2026-09-27T12:05:00Z', device: 'Mobile', os: 'iOS', browser: 'Safari', app, pageviews: 1, engaged_s: 5, events: null }] },
})
const visitOf = (app?: string): VisitStory => buildStory(data(app), 0).visits[0]

describe('the header and the visit take the most recent visit', () => {
  it('reads the app from the newest visit', () => {
    expect(buildStory(data('instagram'), 0).identity.app).toBe('instagram')
    expect(buildStory(data(), 0).identity.app).toBe('')
  })
})

describe('VisitCard app tag', () => {
  const html = (v: VisitStory) => renderToStaticMarkup(<VisitCard v={v} currency={USD} />)
  it('shows the tag for an app visit and nothing for a browser visit', () => {
    expect(html(visitOf('instagram'))).toContain('app-tag">Instagram<')
    expect(html(visitOf('app'))).toContain('app-tag">App<')
    expect(html(visitOf())).not.toContain('app-tag')
  })
})
