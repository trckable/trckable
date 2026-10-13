// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, differs, readView, saveView } from './allView'

const at = (search: string) => history.replaceState(null, '', '/all' + search)

describe('the look of All sites', () => {
  beforeEach(() => {
    localStorage.clear()
    at('')
  })
  it('starts as the Overview of the last 30 days, every site, Visitors', () => {
    expect(readView()).toEqual(DEFAULT_VIEW)
    expect(differs(DEFAULT_VIEW)).toBe(false)
  })
  it('reads the choice from the address', () => {
    at('?period=90&lens=revenue&layout=table&sites=a,b')
    expect(readView()).toEqual({ days: 90, lens: 'revenue', layout: 'table', sites: ['a', 'b'] })
  })
  it('ignores what it does not know', () => {
    at('?period=11&lens=margin&layout=wall')
    expect(readView()).toEqual(DEFAULT_VIEW)
  })
  it('knows Uptime as a lens', () => {
    at('?period=365&lens=uptime')
    expect(readView()).toMatchObject({ days: 365, lens: 'uptime' })
  })
  it('puts the choice in the address and remembers period, lens and layout', () => {
    saveView({ days: 7, lens: 'revenue', layout: 'table', sites: ['a'] })
    expect(location.search).toBe('?period=7&lens=revenue&layout=table&sites=a')
    at('')
    expect(readView()).toEqual({ days: 7, lens: 'revenue', layout: 'table', sites: [] })
  })
  it('lets the address win over what was remembered', () => {
    saveView({ days: 7, lens: 'revenue', layout: 'table', sites: [] })
    at('?layout=overview')
    expect(readView().layout).toBe('overview')
    expect(readView().days).toBe(7)
  })
})
