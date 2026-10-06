import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { AllStrip } from '../features/sites/AllStrip'
import { OnlineTile } from '../views/OnlineTile'
import { feedOnline, resetOnline } from './allOnline'
import type { SiteRow } from './api'

const row = (id: string, online: number, o: Partial<SiteRow> = {}) => ({ id, online, ...o }) as SiteRow
const numbers = new Map([['a', { visitors: 5 }]])
const strip = () => renderToStaticMarkup(<AllStrip on={false} numbers={numbers} onPick={() => {}} />)
const tile = () => renderToStaticMarkup(<OnlineTile />)

describe('who is online over every site', () => {
  beforeEach(resetOnline)

  it('is one number in the switcher header and the All sites tile', () => {
    feedOnline([row('a', 20), row('b', 6)])
    expect(strip()).toContain('>26<')
    expect(tile()).toContain('26')
  })

  it('moves both together when a newer read arrives', () => {
    feedOnline([row('a', 20), row('b', 6)])
    feedOnline([row('a', 25), row('b', 6)])
    expect(strip()).toContain('>31<')
    expect(tile()).toContain('31')
    expect(tile()).not.toContain('26')
  })

  it('leaves out a site that could not be read, in both', () => {
    feedOnline([row('a', 4), row('b', 9, { error: 'x' })])
    expect(strip()).toContain('>4<')
    expect(tile()).toContain('>4<')
  })
})
