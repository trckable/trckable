import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AllStrip } from '../features/sites/AllStrip'
import { feedOnline, resetOnline } from './allOnline'
import type { SiteRow } from './api'

const row = (id: string, online: number, o: Partial<SiteRow> = {}) => ({ id, online, ...o }) as SiteRow
const numbers = new Map([['a', { visitors: 5 }]])
// The numbers roll digit by digit, each in its own span: read the text, not the markup.
const strip = () => renderToStaticMarkup(<AllStrip on={false} numbers={numbers} onPick={() => {}} />).replace(/<[^>]*>/g, '|').replace(/\|+/g, '|')

describe('who is online over every site', () => {
  beforeEach(() => {
    resetOnline()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
  })

  it('is one number in the switcher header', () => {
    feedOnline([row('a', 20), row('b', 6)])
    expect(strip()).toContain('|26 |')
  })

  it('moves when a newer read arrives', () => {
    feedOnline([row('a', 20), row('b', 6)])
    feedOnline([row('a', 25), row('b', 6)])
    expect(strip()).toContain('|31 |')
  })

  it('leaves out a site that could not be read', () => {
    feedOnline([row('a', 4), row('b', 9, { error: 'x' })])
    expect(strip()).toContain('|4 |')
  })
})
