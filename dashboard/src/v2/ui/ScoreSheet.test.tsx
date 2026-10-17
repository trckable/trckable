import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { overall, trafficFromBand, type Score } from '../briefing/model'
import { totalOf, whyRows, type ScoreFacts } from '../briefing/scoreWhy'
import { Hero } from './HeroCard'
import { ScoreBody } from './ScoreSheet'

const band = { c: 560, lo: 504, hi: 616 }
const scores: Score[] = [trafficFromBand(450, band), { key: 'engagement', value: 100, verdict: 'usual', words: 'as usual' }, { key: 'uptime', value: 97, verdict: 'lost', words: '3 min down' }]
const facts: ScoreFacts = { traffic: { now: 450, lo: band.lo, hi: band.hi, hourly: false, weekday: 'Saturday', at: '16:06' }, engagement: { leave: 0.41, usual: 0.4 }, uptime: { pct: '99.8', downMin: 1 } }
const rows = whyRows(scores, facts)
const noop = () => {}
const say = { lead: 'A calm Saturday:', long: [{ t: 'x' }], short: [{ t: 'x' }], sub: '', bad: false }

describe('the ring and its parts open a sheet', () => {
  const html = renderToStaticMarkup(<Hero say={say} scores={scores} rows={rows} onSee={noop} learn={null} period="Today" onPeriod={noop} chart={null} />)
  it('the ring and each part are real buttons, so Tab reaches them and Enter or Space opens them', () => {
    expect(html).toMatch(/<button type="button" class="mk-ring"/)
    for (const s of scores) expect(html).toMatch(new RegExp(`<button type="button" class="[^"]*" data-contrib="${s.key}"`))
  })
  it('the ring shows the score the sheet adds up to', () => {
    expect(html).toContain(`<b>${overall(scores)}</b>`)
    expect(totalOf(rows)).toBe(overall(scores))
  })
})

describe('the sheet body', () => {
  it('a part shows its own number and figures, and a way to its table', () => {
    const html = renderToStaticMarkup(<ScoreBody rows={rows.filter((r) => r.key === 'traffic')} all={false} onSee={noop} />)
    expect(html).toContain(`<b>${scores[0].value}</b>`)
    expect(html).toContain('450 people by 16:06')
    expect(html).toContain('504–616')
    expect(html).toContain('<button type="button" class="xb"')
    expect(html).not.toContain('counts 40%')
  })
  it('the ring shows all the parts, each with its number, and the weights', () => {
    const html = renderToStaticMarkup(<ScoreBody rows={rows} all onSee={noop} />)
    for (const s of scores) expect(html).toContain(`<b>${s.value}</b>`)
    expect(html).toContain('40%')
    expect(html).toContain('25%')
    expect(html).toContain('35%')
  })
})
