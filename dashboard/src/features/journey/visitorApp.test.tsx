import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IdentityHead, techParts } from './IdentityCard'
import { VisitCard } from './VisitCard'
import { VisitList } from './VisitList'
import { buildStory, foldNodes, splitVisits, type VisitStory } from './model'
import type { JourneyResult, JourneyVisit } from '../../lib/api'

describe('techParts', () => {
  it('drops "Mobile" when the system is known and ends with how it opened', () => {
    expect(techParts({ device: 'Mobile', browser: 'Safari', os: 'iOS', app: '' })).toEqual(['iOS browser'])
    expect(techParts({ device: 'Mobile', browser: 'Safari', os: 'iOS', app: 'app' })).toEqual(['iOS app'])
    expect(techParts({ device: 'Tablet', browser: 'Chrome', os: 'Android', app: 'app' })).toEqual(['Android app'])
    expect(techParts({ device: 'Mobile', browser: 'Safari', os: 'iOS', app: 'instagram' })).toEqual(['iOS', 'Instagram'])
  })
  it('says "Desktop app" for a desktop that is an app', () => {
    expect(techParts({ device: 'Desktop', browser: 'Chrome', os: 'Windows', app: 'app' })).toEqual(['Desktop app', 'Windows'])
  })
  it('keeps the desktop line as it was, with its browser', () => {
    expect(techParts({ device: 'Desktop', browser: 'Chrome', os: 'macOS', app: '' })).toEqual(['Desktop', 'Chrome', 'macOS'])
  })
  it('keeps the device word when no system is known', () => {
    expect(techParts({ device: 'Tablet', browser: '', os: '', app: '' })).toEqual(['Tablet'])
  })
})

const START = Date.parse('2026-09-27T12:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const visitOf = (extra: Partial<JourneyVisit> = {}, pages = 1, at = START): JourneyVisit => ({
  start: iso(at),
  end: iso(at + 5 * 60000),
  device: 'Mobile',
  os: 'iOS',
  browser: 'Safari',
  pageviews: pages,
  engaged_s: 5,
  events: Array.from({ length: pages }, (_, i) => ({ at: iso(at + i * 1000), kind: 'pageview', path: `/p${i}`, engaged_s: 3 })),
  ...extra,
})
const dataOf = (...visits: JourneyVisit[]): JourneyResult => ({ journey: { visitor: '1', visits } })
const story = (...visits: JourneyVisit[]) => buildStory(dataOf(...visits), 0)
const head = (v: JourneyVisit) => renderToStaticMarkup(<IdentityHead who={story(v).identity} titleId="t" />)

describe('the header draws how they came', () => {
  it('iOS in Safari: the Apple mark and the Safari logo, words kept', () => {
    const html = head(visitOf())
    expect(html).toContain('title="iOS"')
    expect(html).toContain('title="iOS browser · Safari"')
    expect(html).toContain('<b>iOS browser</b>')
  })
  it('iOS in the Instagram app: the Apple mark and the Instagram brand, "Instagram app"', () => {
    const html = head(visitOf({ app: 'instagram' }))
    expect(html).toContain('title="iOS"')
    expect(html).toContain('title="Instagram app"')
    expect(html).toContain('data-mark="app-instagram"')
  })
  it('Android in Chrome', () => {
    const html = head(visitOf({ os: 'Android', browser: 'Chrome' }))
    expect(html).toContain('data-mark="android"')
    expect(html).toContain('data-mark="chrome"')
  })
  it('an app without a name gets its system: "iOS app", "Android app"', () => {
    expect(head(visitOf({ app: 'app' }))).toContain('<b>iOS app</b>')
    expect(head(visitOf({ app: 'app', os: 'Android', browser: 'Chrome' }))).toContain('<b>Android app</b>')
  })
  it('a desktop: its system and its browser', () => {
    const html = head(visitOf({ device: 'Desktop', os: 'Windows', browser: 'Edge' }))
    expect(html).toContain('data-mark="windows"')
    expect(html).toContain('data-mark="edge"')
  })
})

describe('the header and the visit take the most recent visit', () => {
  it('reads the app from the newest visit', () => {
    expect(story(visitOf({ app: 'instagram' })).identity.app).toBe('instagram')
    expect(story(visitOf()).identity.app).toBe('')
  })
})

describe('a visit names how it came only when that differs from the header', () => {
  const html = (v: VisitStory, who?: VisitStory) => renderToStaticMarkup(<VisitCard v={v} who={who && story(visitOf({ os: who.os, browser: who.browser, app: who.app })).identity} currency="USD" />)
  it('says nothing when it is the same, and the mark when it is not', () => {
    const same = story(visitOf()).visits[0]
    expect(html(same, same)).not.toContain('jr-mk')
    const other = story(visitOf({ browser: 'Chrome', os: 'Android' })).visits[0]
    expect(html(other, same)).toContain('data-mark="android"')
  })
})

describe('a long visit folds to the first two pages, one row, the last two', () => {
  const nodes = (n: number) => story(visitOf({}, n)).visits[0].nodes
  it('keeps a short visit whole', () => {
    expect(foldNodes(nodes(5)).every((n) => n.kind === 'page')).toBe(true)
    expect(foldNodes(nodes(5))).toHaveLength(5)
  })
  it('folds the pages between', () => {
    const rows = foldNodes(nodes(9))
    expect(rows.map((r) => r.kind)).toEqual(['page', 'page', 'fold', 'page', 'page'])
    expect(rows[2]).toMatchObject({ hidden: 5 })
  })
  it('shows the row with the count of hidden pages', () => {
    const v = story(visitOf({}, 9)).visits[0]
    const html = renderToStaticMarkup(<VisitCard v={v} currency="USD" />)
    expect(html).toContain('+5 pages')
    expect(html).not.toContain('/p4')
  })
  it('never hides a payment or a goal', () => {
    const v = story(visitOf({}, 9))
    const list = v.visits[0].nodes
    list.splice(4, 0, { kind: 'goal', key: 'g', at: list[4].at, offset: 4, goal: 'Signup' })
    const rows = foldNodes(list)
    expect(rows.some((r) => r.kind === 'goal')).toBe(true)
  })
})

describe('many visits fold behind one row', () => {
  const visits = (n: number) => Array.from({ length: n }, (_, i) => visitOf({}, 1, START - i * 86400000))
  it('shows three, then folds the rest', () => {
    expect(splitVisits(story(...visits(4)).visits).folded).toHaveLength(0)
    const s = splitVisits(story(...visits(6)).visits)
    expect(s.shown).toHaveLength(3)
    expect(s.folded).toHaveLength(3)
  })
  it('renders the "earlier visits" row only past three', () => {
    const list = (n: number) => {
      const s = story(...visits(n))
      return renderToStaticMarkup(<VisitList visits={s.visits} who={s.identity} currency="USD" zone="UTC" />)
    }
    expect(list(3)).not.toContain('earlier')
    expect(list(5)).toContain('2 earlier visits')
  })
})
