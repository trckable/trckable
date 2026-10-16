import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedOnline, resetOnline } from '../../lib/allOnline'
import type { SiteRow } from '../../lib/api'
import { AllRow } from './AllRow'

const row = (id: string, online: number, o: Partial<SiteRow> = {}) => ({ id, online, ...o }) as SiteRow
const numbers = new Map([['a', { visitors: 5 }]])
// The numbers roll digit by digit, each in its own span: read the text, not the markup.
const text = (n: Map<string, { visitors: number }> | null = numbers) => renderToStaticMarkup(<AllRow on={false} numbers={n} all="All sites" onPick={() => {}} />).replace(/<[^>]*>/g, '|').replace(/\|+/g, '|')

describe('the All sites row', () => {
  beforeEach(() => {
    resetOnline()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
  })

  it('is only its name until the numbers are here, then adds online now and today', () => {
    expect(text(null)).not.toContain('today')
    feedOnline([row('a', 2), row('b', 1)])
    const by = new Map([['a', { visitors: 12 }], ['b', { visitors: 30 }]])
    expect(text(by)).toContain('|3|')
    expect(text(by)).toContain('|42|')
  })

  it('is one number for every site', () => {
    feedOnline([row('a', 20), row('b', 6)])
    expect(text()).toContain('|26|')
  })

  it('moves when a newer read arrives', () => {
    feedOnline([row('a', 20), row('b', 6)])
    feedOnline([row('a', 25), row('b', 6)])
    expect(text()).toContain('|31|')
  })

  it('leaves out a site that could not be read', () => {
    feedOnline([row('a', 4), row('b', 9, { error: 'x' })])
    expect(text()).toContain('|4|')
  })
})
