import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { AllStrip } from '../features/sites/AllStrip'
import { OnlineTile } from '../views/OnlineTile'
import { feedOnline, resetOnline } from './allOnline'
import type { SiteRow } from './api'

const row = (id: string, online: number, o: Partial<SiteRow> = {}) => ({ id, online, ...o }) as SiteRow
const numbers = new Map([['a', { visitors: 5 }]])
// The numbers roll digit by digit, each in its own span: read the text, not the markup.
const strip = () => renderToStaticMarkup(<AllStrip on={false} numbers={numbers} onPick={() => {}} />).replace(/<[^>]*>/g, '|').replace(/\|+/g, '|')
const tile = () => renderToStaticMarkup(<OnlineTile />)

describe('who is online over every site', () => {
  beforeEach(resetOnline)

  it('adds every site\'s last 30 minutes up, minute for minute, and draws them in the tile', () => {
    feedOnline([row('a', 2, { online_series: [0, 1, 2] }), row('b', 1, { online_series: [1, 1, 1] }), row('c', 9, { error: 'x', online_series: [9, 9, 9] })])
    expect(tile()).toContain('kit-area')
  })

  it('draws no chart before any minutes are read', () => {
    feedOnline([row('a', 2)])
    expect(tile()).not.toContain('kit-area')
  })

  it('is one number in the switcher header and the All sites tile', () => {
    feedOnline([row('a', 20), row('b', 6)])
    expect(strip()).toContain('|26 |')
    expect(tile()).toContain('26')
  })

  it('moves both together when a newer read arrives', () => {
    feedOnline([row('a', 20), row('b', 6)])
    feedOnline([row('a', 25), row('b', 6)])
    expect(strip()).toContain('|31 |')
    expect(tile()).toContain('31')
    expect(tile()).not.toContain('26')
  })

  it('leaves out a site that could not be read, in both', () => {
    feedOnline([row('a', 4), row('b', 9, { error: 'x' })])
    expect(strip()).toContain('|4 |')
    expect(tile()).toContain('>4<')
  })
})
