/* eslint-disable react/jsx-no-literals -- test fixtures: sample words */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Area, Card, Columns, Finding, Gauge, HeroNumber, InsightText, ListTable, MetricArea, Pill, Progress, ScoreKnob, Segmented, SplitBlocks, StatTrio, StatusTag, TrendChart, Verdict } from './index'

const html = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('Card', () => {
  it('is a section with a title and a corner button when it opens something', () => {
    const h = html(<Card title="Visitors" onOpen={() => {}} openLabel="Open visitors">body</Card>)
    expect(h).toContain('<section')
    expect(h).toContain('aria-label="Open visitors"')
    expect(h).toContain('body')
  })
  it('is one button when pressed, with the corner only a mark', () => {
    const h = html(<Card title="A" press={() => {}} onOpen={() => {}}>x</Card>)
    expect(h).toMatch(/^<button/)
    expect(h.match(/<button/g)).toHaveLength(1)
  })
})

describe('Pill and StatusTag', () => {
  it('carry their tone as a class', () => {
    expect(html(<Pill tone="bad">▼ 3%</Pill>)).toContain('kit-pill bad')
    expect(html(<StatusTag tone="good">Paid</StatusTag>)).toContain('kit-tag good')
  })
})

describe('Segmented', () => {
  it('is a radio group with the chosen one checked and the others out of the tab order', () => {
    const h = html(<Segmented options={[{ value: 'd', label: 'D' }, { value: 'm', label: 'M' }]} value="m" onChange={() => {}} />)
    expect(h).toContain('role="radiogroup"')
    expect(h).toMatch(/aria-checked="true"[^>]*tabindex="0"[^>]*>M|tabindex="0"[^>]*aria-checked="true"/)
    expect(h).toContain('tabindex="-1"')
  })
})

describe('MetricArea', () => {
  it('shows value, pill and sub, and an area only when there are days to draw', () => {
    const withDays = html(<MetricArea label="Visitors" value="38,035" pill={{ text: '▲ 9%', tone: 'good' }} sub="30 days" series={[1, 2, 3, 2]} />)
    expect(withDays).toContain('38,035')
    expect(withDays).toContain('kit-pill good')
    expect(withDays).toContain('kit-area')
    expect(html(<MetricArea label="Visitors" value="1" />)).not.toContain('kit-area')
  })
  it('draws the area in the colour it is given', () => {
    expect(html(<MetricArea label="A" value="1" series={[1, 2, 3]} color="#3b82f6" />)).toContain('#3b82f6')
  })
})

describe('Area', () => {
  it('is a line and a fill', () => {
    expect(html(<Area values={[1, 2, 3]} color="red" />).match(/<path/g)).toHaveLength(2)
  })
})

describe('Gauge and ScoreKnob', () => {
  it('Gauge says the share, and draws that much of the ring', () => {
    const h = html(<Gauge pct={37} />)
    expect(h).toContain('37%')
    expect(h).toContain('stroke-dasharray="37 100"')
  })
  it('ScoreKnob says the score out of 100 and keeps it in range', () => {
    const h = html(<ScoreKnob score={140} title="Health" sub="up" />)
    expect(h).toContain('100 out of 100')
    expect(h).toContain('kit-knob')
  })
})

describe('Verdict', () => {
  it('is a word, a pill and an ask that is a button only with an action', () => {
    const plain = html(<Verdict title="This month" word="Strong" pill={{ text: '+21.8%' }} ask="See what changed" />)
    expect(plain).toContain('Strong')
    expect(plain).toContain('+21.8%')
    expect(plain).not.toContain('<button')
    expect(html(<Verdict word="Strong" ask="See" onAsk={() => {}} />)).toContain('<button')
  })
})

describe('the smaller cards', () => {
  it('StatTrio lists its three', () => {
    const h = html(<StatTrio items={[{ key: 'a', label: 'Visits', value: '1' }, { key: 'b', label: 'Bounce', value: '2' }, { key: 'c', label: 'Time', value: '3' }]} />)
    expect(h.match(/kit-val small/g)).toHaveLength(3)
  })
  it('HeroNumber carries the big number', () => {
    expect(html(<HeroNumber title="Goal" value="3.4%" pill={{ text: '+0.6' }} />)).toContain('kit-hero-num')
  })
  it('SplitBlocks writes each share', () => {
    expect(html(<SplitBlocks title="Devices" items={[{ key: 'm', label: 'Mobile', share: 63 }]} />)).toContain('63%')
  })
  it('Columns put the share inside a column long enough to hold it, and name each for a reader', () => {
    const h = html(<Columns title="Starts" cols={[{ key: 'a', label: 'Home', pct: 45 }, { key: 'b', label: 'Other', pct: 5 }]} />)
    expect(h).toContain('aria-label="Home: 45%"')
    expect(h).toContain('>45%<')
    expect(h).not.toContain('>5%<')
  })
  it('Finding is the tag and a sentence', () => {
    const h = html(<Finding tag="Finding">Up <b>24%</b></Finding>)
    expect(h).toContain('kit-tagchip')
    expect(h).toContain('<b>24%</b>')
  })
  it('InsightText shows its sources by name', () => {
    expect(html(<InsightText title="Insight" sources={[{ key: 'g', label: 'ChatGPT', initial: 'G', color: '#10a37f' }]}>text</InsightText>)).toContain('aria-label="ChatGPT"')
  })
  it('Progress weights its parts and lists its actions', () => {
    const h = html(<Progress title="Setup" value="75%" parts={[{ key: 'a', label: 'One', weight: 5, done: true }, { key: 'b', label: 'Two', weight: 2 }]} actions={[{ key: 'x', label: 'Connect', onClick: () => {} }]} />)
    expect(h).toContain('flex:5')
    expect(h).toContain('kit-act')
  })
  it('ListTable heads its columns and fills its rows', () => {
    const h = html(<ListTable title="Sales" columns={[{ key: 'f', head: 'From', cell: (r: { f: string }) => r.f }]} rows={[{ f: 'Search' }]} rowKey={(r) => r.f} />)
    expect(h).toContain('scope="col"')
    expect(h).toContain('Search')
  })
  it('TrendChart draws its points, and a tip for the picked one', () => {
    const h = html(<TrendChart values={[1, 3, 2, 5]} range={[1, 2]} axis={[{ at: 0, label: 'Jan' }]} tip={(i) => `point ${i}`} />)
    expect(h).toContain('kit-trend-line')
    expect(h).toContain('point 2')
    expect(h).toContain('Jan')
  })
})
