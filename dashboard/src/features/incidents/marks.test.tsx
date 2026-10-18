import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { Incident } from './api'
import { bucketFor, lineOf } from './IncidentMarks'
import { routeOf } from '../subpage'
import { Summary } from './Summary'
import { Timeline } from './Timeline'
import type { Site } from '../../lib/api'
import { setRole } from '../../lib/me'

const at = (iso: string) => Date.parse(iso) / 1000
const inc = (o: Partial<Incident>): Incident => ({ id: 'i', site: 's', kind: 'down', started_at: 0, ended_at: null, cause: 'x', expected_visits: null, note: '', ...o })
const site = (domain: string): Site => ({ id: domain, domain, name: '', timezone: 'UTC', currency: 'USD', proxy_key: '' })

describe('the incident marks on the chart', () => {
  it('says a closed and an open incident in a line', () => {
    const closed = inc({ started_at: at('2026-10-01T10:00:00Z'), ended_at: at('2026-10-01T13:12:00Z') })
    expect(lineOf(closed, at('2026-10-02T00:00:00Z'))).toBe('Down 3h 12m · not reachable')
    const quiet = inc({ kind: 'quiet', started_at: at('2026-10-01T10:00:00Z') })
    expect(lineOf(quiet, at('2026-10-01T16:00:00Z'))).toBe('Quiet for 6h so far · no visits')
  })

  it('puts an incident in the bucket it began in, or nowhere when the chart does not show it', () => {
    const x = inc({ started_at: at('2026-10-02T09:30:00Z') })
    const days = ['2026-10-01', '2026-10-02', '2026-10-03']
    expect(bucketFor(x, days, 'day', 'UTC')).toBe(1)
    expect(bucketFor(x, ['2026-10-05'], 'day', 'UTC')).toBe(-1)
    const hours = ['2026-10-02T08:00', '2026-10-02T09:00', '2026-10-02T10:00']
    expect(bucketFor(x, hours, 'hour', 'UTC')).toBe(1)
  })
})

describe('the incident page', () => {
  afterEach(() => setRole())
  it('reads its address as the site and the page', () => {
    const sites = [site('a.example'), site('b.example')]
    setRole('owner', false) // the Mentions page exists only where the server switched it on
    expect(routeOf(sites, '/b.example/incidents')).toMatchObject({ sub: 'incidents', site: { id: 'b.example' } })
    // The Mentions page is an address only where the server has Mentions on.
    expect(routeOf(sites, '/b.example/mentions')).toMatchObject({ sub: null })
    setRole('owner', true)
    expect(routeOf(sites, '/b.example/mentions')).toMatchObject({ sub: 'mentions', site: { id: 'b.example' } })
    expect(routeOf(sites, '/b.example')).toMatchObject({ sub: null, site: { id: 'b.example' } })
    expect(routeOf(sites, '/nope.example/incidents')).toEqual({ site: null, sub: null })
    setRole('owner', false)
    expect(routeOf(sites, '/b.example/mentions')).toMatchObject({ sub: null })
  })

  it('writes the figures, and no visits card where the visits cannot be estimated', () => {
    const html = renderToStaticMarkup(<Summary totals={{ count: 2, seconds: 3 * 3600, lost: 340, lost_some: true }} silent={false} label="Last 30 days" watch={{ span: 30 * 86400 }} />)
    expect(html).toContain('99.6%')
    expect(html).toContain('≈ 340 visits')
    expect(html).toContain('3h')
    const none = renderToStaticMarkup(<Summary totals={{ count: 1, seconds: 600, lost: 0, lost_some: false }} silent={false} label="Last 30 days" watch={{ span: 86400 }} />)
    expect(none).not.toContain('≈')
    expect(none).not.toContain('Visits lost')
    const silent = renderToStaticMarkup(<Summary totals={{ count: 1, seconds: 86400, lost: 0, lost_some: false }} silent label="Last 30 days" watch={{ span: 86400 }} />)
    expect(silent).toContain('No visits all period')
    expect(silent).not.toContain('0.0%')
  })

  it('is one calm card when the period had no incident', () => {
    const html = renderToStaticMarkup(<Summary totals={{ count: 0, seconds: 0, lost: 0, lost_some: false }} silent={false} label="Last 30 days" watch={{ span: 30 * 86400 }} />)
    expect(html).toContain('No incidents · Last 30 days')
    expect(html).toContain('100% up')
    expect(html).not.toContain('inc-card')
  })

  it('says so when the period was not watched, or only partly, or only for down checks', () => {
    const none = { count: 0, seconds: 0, lost: 0, lost_some: false }
    const unwatched = renderToStaticMarkup(<Summary totals={none} silent={false} label="Last 30 days" watch={{ span: 0, since: 'Oct 14, 2026' }} />)
    expect(unwatched).toContain('Not watched yet')
    expect(unwatched).not.toContain('100%')
    const part = renderToStaticMarkup(<Summary totals={none} silent={false} label="Last 30 days" watch={{ span: 86400, since: 'Oct 13, 2026', quietTracked: false }} />)
    expect(part).toContain('100% up · down checks only · watched since Oct 13, 2026')
    const cards = renderToStaticMarkup(<Summary totals={{ count: 1, seconds: 600, lost: 0, lost_some: false }} silent={false} label="x" watch={{ span: 86400, quietTracked: false }} />)
    expect(cards).toContain('Down checks only')
  })

  it('draws the days before watching began as unwatched, with a legend entry only then', () => {
    const now = at('2026-10-10T00:00:00Z')
    const html = renderToStaticMarkup(<Timeline list={[]} from="2026-10-01" to="2026-10-10" tz="UTC" now={now} watchedSince={at('2026-10-08T05:00:00Z')} />)
    expect(html.match(/<i class="unwatched"/g)).toHaveLength(7)
    expect(html).toContain('<li class="unwatched">Not watched yet</li>')
    expect(renderToStaticMarkup(<Timeline list={[]} from="2026-10-01" to="2026-10-10" tz="UTC" now={now} />)).not.toContain('unwatched')
  })

  it('draws a long period as a year grid and a short one as a strip', () => {
    const now = at('2026-10-10T00:00:00Z')
    const year = renderToStaticMarkup(<Timeline list={[inc({ started_at: at('2026-03-01T00:00:00Z'), ended_at: at('2026-03-01T05:00:00Z') })]} from="2026-01-01" to="2026-10-10" tz="UTC" now={now} />)
    expect(year).toContain('inc-days grid')
    expect(year).toContain('<i class="down"')
    const strip = renderToStaticMarkup(<Timeline list={[]} from="2026-10-01" to="2026-10-10" tz="UTC" now={now} />)
    expect(strip).toContain('inc-days strip')
    expect(strip).not.toContain('<i class="down"')
  })
})
