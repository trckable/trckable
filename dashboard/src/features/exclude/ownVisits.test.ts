// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canLeaveOut, choose, flagLink, nextChoice, onSiteItself, stateOf } from './ownVisits'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

const site = { id: 'tkb_a', domain: 'shop.example' }

describe('the link that leaves a browser out', () => {
  it('is the site itself with the tracker\'s own flag: ignore, and track to undo', () => {
    expect(flagLink('shop.example', 'ignore')).toBe('https://shop.example/?trckable=ignore')
    expect(flagLink('shop.example', 'track')).toBe('https://shop.example/?trckable=track')
  })
})

describe('what is known about this browser', () => {
  it('is not known from another address: nothing was chosen yet', () => {
    expect(stateOf(site, 'app.trckable.example')).toBeNull()
    expect(nextChoice(null)).toBe('ignore')
  })

  it('is what was last chosen here, and the next press is the other way', () => {
    choose(site, 'ignore', localStorage)
    expect(stateOf(site, 'app.trckable.example')).toBe('excluded')
    expect(nextChoice('excluded')).toBe('track')
    choose(site, 'track', localStorage)
    expect(stateOf(site, 'app.trckable.example')).toBe('counted')
    expect(nextChoice('counted')).toBe('ignore')
  })

  it('is the real flag when the dashboard is on the site itself', () => {
    expect(onSiteItself('shop.example', 'www.Shop.example')).toBe(true)
    expect(onSiteItself('shop.example', 'blog.shop.example')).toBe(false)
    expect(stateOf(site, 'shop.example')).toBe('counted')
    localStorage.setItem('trckable_ignore', '1')
    expect(stateOf(site, 'shop.example')).toBe('excluded')
  })

  it('is one site at a time', () => {
    choose(site, 'ignore', localStorage)
    expect(stateOf({ id: 'tkb_b', domain: 'other.example' }, 'app.trckable.example')).toBeNull()
  })

  it('is unknown when the browser will not say, and never throws', () => {
    const closed = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(stateOf(site, 'app.trckable.example', closed)).toBeNull()
    vi.spyOn(window, 'open').mockReturnValue(null)
    expect(() => choose(site, 'ignore', closed)).not.toThrow()
  })
})

describe('pressing it', () => {
  it('opens the site in a new tab, cut off from the dashboard', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    choose(site, 'ignore', localStorage)
    expect(open).toHaveBeenCalledWith('https://shop.example/?trckable=ignore', '_blank', 'noopener')
  })

  it('is not offered where the tracker stores nothing to leave a browser out by', () => {
    expect(canLeaveOut({ cookieless: true })).toBe(false)
    expect(canLeaveOut({ cookieless: false })).toBe(true)
    expect(canLeaveOut({})).toBe(true)
  })
})
