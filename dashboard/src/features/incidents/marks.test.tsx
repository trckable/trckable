import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { Incident } from './api'
import { bucketFor, lineOf } from './IncidentMarks'
import { routeOf } from '../subpage'
import { Hero, type Figures, type Watch } from './Hero'
import { figuresOf, standingOf } from './model'
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

  const NOW = at('2026-10-18T12:00:00Z')
  const hero = (f: Figures, w: Partial<Watch>, now = standingOf(undefined, null)) => renderToStaticMarkup(<Hero now={now} at={NOW} f={f} w={{ span: 30 * 86400, silent: false, ...w }} over="30 days" />)
  const none: Figures = { count: 0, seconds: 0, lost: 0, lostSome: false }

  it('writes the state and the figures, equal to the rows behind them, and no visits figure without an estimate', () => {
    const rows = [inc({ id: 'a', started_at: NOW - 86400, ended_at: NOW - 86400 + 3600, expected_visits: 100 }), inc({ id: 'b', kind: 'quiet', started_at: NOW - 3 * 86400, ended_at: NOW - 3 * 86400 + 7200, expected_visits: 240 })]
    const f = figuresOf(rows, NOW - 30 * 86400, NOW, NOW)
    expect(f).toEqual({ count: 2, seconds: 3 * 3600, lost: 340, lostSome: true })
    const html = hero(f, {})
    expect(html).toContain('Up')
    expect(html).toContain('99.6%')
    expect(html).toContain('2 incidents, about 340 visits lost')
    expect(html).toContain('≈ 340')
    expect(html).toContain('3h')
    const noEstimate = hero(figuresOf([inc({ started_at: NOW - 7200, ended_at: NOW - 6600 })], NOW - 86400, NOW, NOW), { span: 86400 })
    expect(noEstimate).not.toContain('≈')
    expect(noEstimate).not.toContain('Visits lost')
    const silent = hero({ count: 1, seconds: 86400, lost: 0, lostSome: false }, { span: 86400, silent: true })
    expect(silent).toContain('No visits all period')
    expect(silent).not.toContain('0.0%')
  })

  it('says Down in red for as long as it has lasted, Quiet with its footnote, and nothing while it is not known', () => {
    const down = hero(none, {}, standingOf(NOW - 9 * 60, null))
    expect(down).toContain('inc-state down')
    expect(down).toContain('Down for 9m')
    const open = inc({ kind: 'quiet', started_at: NOW - 7200 })
    const quiet = hero(none, {}, standingOf(undefined, open))
    expect(quiet).toContain('Quiet for 2h')
    expect(quiet).toContain('inc-word')
    expect(hero(none, {}, standingOf(undefined, undefined))).not.toContain('inc-state')
  })

  it('has no incident line for a clean period, and says so when the period was not watched or only for down checks', () => {
    const clean = hero(none, {})
    expect(clean).toContain('100.0%')
    expect(clean).not.toContain('inc-line')
    const unwatched = hero(none, { span: 0, since: 'Oct 14, 2026' })
    expect(unwatched).toContain('Not watched yet')
    expect(unwatched).toContain('Incidents are recorded from Oct 14, 2026 on.')
    expect(unwatched).not.toContain('100')
    expect(hero(none, { span: 86400, since: 'Oct 13, 2026', quietTracked: false })).toContain('Down checks only')
  })

  it('draws only the days since watching began, and names the day', () => {
    const now = at('2026-10-10T00:00:00Z')
    const html = renderToStaticMarkup(<Timeline list={[]} from="2026-10-01" to="2026-10-10" tz="UTC" now={now} watchedSince={at('2026-10-08T05:00:00Z')} since="Oct 8, 2026" />)
    expect(html).not.toContain('unwatched')
    expect(html.match(/<i class="ok"/g)).toHaveLength(3)
    expect(html).toContain('Watching since Oct 8, 2026')
    expect(renderToStaticMarkup(<Timeline list={[]} from="2026-10-01" to="2026-10-10" tz="UTC" now={now} watchedSince={at('2026-10-20T00:00:00Z')} />)).toBe('')
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
