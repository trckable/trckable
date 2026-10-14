// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, differs, hasLayout, menuDiffers, readView, saveView } from './allView'
import { periodsFor } from './AllPeriod'

const at = (search: string) => history.replaceState(null, '', '/sites' + search)

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
  it('offers Layout only where it changes what is shown, not on Uptime', () => {
    expect(hasLayout({ lens: 'visitors' })).toBe(true)
    expect(hasLayout({ lens: 'revenue' })).toBe(true)
    expect(hasLayout({ lens: 'uptime' })).toBe(false)
  })
  it('does not count a setting the menu hides as a change', () => {
    expect(menuDiffers({ ...DEFAULT_VIEW, lens: 'uptime', layout: 'table' })).toBe(true) // Uptime itself differs
    expect(menuDiffers({ ...DEFAULT_VIEW, layout: 'table' })).toBe(true)
    expect(menuDiffers(DEFAULT_VIEW)).toBe(false)
  })
  it('offers 12 months wherever the data has it, and every period on Uptime', () => {
    expect(periodsFor({ layout: 'overview', lens: 'visitors' })).toEqual([7, 30, 90])
    expect(periodsFor({ layout: 'table', lens: 'visitors' })).toEqual([7, 30, 90, 365])
    expect(periodsFor({ layout: 'overview', lens: 'uptime' })).toEqual([7, 30, 90, 365])
  })
})
