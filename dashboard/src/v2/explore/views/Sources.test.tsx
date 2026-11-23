import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AnswersReport } from '../../../features/answers/api'
import { askOf } from '../open'
import type { XCtx } from '../ctx'
import type { SearchReport } from '../../../lib/api'
import { mapSearch } from '../data/mapSections'
import type { Quality as QualityModel, Search, Table } from '../types'
import { engagedOf, googleSeen, mentionsOf, rowsOf, seenNote } from './Sources'

const rep = (clicks: number, impressions: number): SearchReport => ({ property: 'p', dim: 'query', rows: [{ key: 'a', clicks, impressions, ctr: 0.1, position: 2 }], from: '', to: '', clicks, impressions, preliminary_from: '', ignored_filters: null })
const search = (clicks: number, impressions: number): Search => mapSearch({ query: rep(clicks, impressions), pages: rep(clicks, impressions), window: '3 Nov – 9 Nov' })
const table: Table = {
  of: 100,
  rows: [
    { val: 'google.com', name: 'google.com', v: 40, c: 30, st: '', su: 3 },
    { val: 'chatgpt.com', name: 'chatgpt.com', v: 10, c: 0, st: '' },
    { val: '', name: 'Direct', v: 5, c: 5, st: '', su: 0 },
  ],
}
const x = { pick: vi.fn(), setSource: vi.fn() } as unknown as XCtx
const answers = { engines: ['openai'], questions: [{ engines: { openai: { seen: 2 } } }, { engines: { openai: { seen: 3 } } }] } as unknown as AnswersReport
const quality: QualityModel = { say: '', main: 'engaged', goal: null, paid: false, rows: [{ value: 'google.com', engaged: 0.6 }, { value: '', engaged: null }] as QualityModel['rows'] }

describe('what Google says, from the search data', () => {
  it('is the very numbers the panel\'s tiles say, for the one window', () => {
    const g = search(9873, 263000)
    const row = rowsOf({ of: 1, rows: [{ val: 'google.com', name: 'google.com', v: 11094, c: 0, st: '' }] }, googleSeen(g), null, null, x)[0]
    expect(row.c.slice(0, 2)).toEqual(['263k', '9,873'])
    expect(g.kcs[0]).toMatchObject({ label: 'Clicked', val: '9,873' })
    expect(g.kcs[1]).toMatchObject({ label: 'Seen', val: '263k' })
    expect(g.window).toBe('3 Nov – 9 Nov')
  })
  it('says which days the Google row is for, with the panel title\'s range, only where the row shows them', () => {
    expect(seenNote(table, search(1, 2))).toBe('Seen and clicked: Google, 3 Nov – 9 Nov (Google runs 2–3 days behind)')
    expect(seenNote({ of: 1, rows: [{ val: 'x.com', name: 'x.com', v: 1, c: 1, st: '' }] }, search(1, 2))).toBeNull()
    expect(seenNote(table, null)).toBeNull()
  })
  it('says nothing where Search Console is off or has too little', () => {
    expect(googleSeen(null)).toBeNull()
    expect(googleSeen({ ...search(1, 1), on: false })).toBeNull()
    expect(googleSeen({ ...search(1, 1), enough: false })).toBeNull()
  })
})

describe('the sources table', () => {
  const rows = rowsOf(table, { seen: 4000, clicked: 120 }, answers, quality, x)
  it('gives Google its seen and clicked, then the people and signups', () => {
    expect(rows[0].c).toEqual(['4.0k', '120', '40', '60%', '3'])
  })
  it('shows an assistant\'s Answers mentions as seen, and a dash where a source has no such step', () => {
    expect(rows[1].c).toEqual(['5', '–', '10', '–', '–'])
    expect(rows[2].c).toEqual(['–', '–', '5', '–', '0'])
  })
  it('opens the panel on Google, and filters on any other source', () => {
    rows[0].onPick?.()
    expect(x.setSource).toHaveBeenCalledWith('google')
    rows[2].onPick?.()
    expect(x.pick).toHaveBeenCalledWith('channel', 'Direct')
    expect(renderToStaticMarkup(<>{rows[0].a}</>)).toContain('google.com')
  })
  it('has no mentions where Answers is off or does not ask the assistant, never robot reads', () => {
    expect(mentionsOf(answers, 'www.chatgpt.com')).toBe(5)
    expect(mentionsOf(answers, 'claude.ai')).toBeNull()
    expect(mentionsOf(null, 'chatgpt.com')).toBeNull()
    expect(engagedOf(quality.rows, 'x.com')).toBe('–')
})
})

describe('the old Search address', () => {
  it('opens Sources with the Google panel', () => {
    expect(askOf({ xp: 'search', xf: undefined, xs: undefined, filters: [] })).toEqual({ tab: 'sources', filters: [], source: 'google' })
  })
  it('opens the panel on the address of one, and only in Sources', () => {
    expect(askOf({ xp: 'sources', xf: undefined, xs: 'google', filters: [] })?.source).toBe('google')
    expect(askOf({ xp: 'pages', xf: undefined, xs: 'google', filters: [] })?.source).toBeUndefined()
    expect(askOf({ xp: 'referrers', xf: undefined, xs: undefined, filters: [] })?.tab).toBe('sources')
  })
})
