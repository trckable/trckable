import { describe, expect, it } from 'vitest'
import type { HeatMap, Spot } from './api'
import { busiest, exampleHeat, fit, frameSrc, glow, hasViews, isRisky, heatColor, pageSize, place, scrollGradient, strength } from './model'

const spot = (o: Partial<Spot> = {}): Spot => ({ el: 'a.buy', cx: 0, cy: 0, n: 5, x: 100, y: 300, w: 200, h: 40, ...o })

describe('where a click is on the page', () => {
  it('is the element’s average place plus the tenth of it that was hit, centred in that tenth', () => {
    // 1280 px wide: the element starts at 128 px and is 256 px wide; its first tenth is 25.6 px, centred at 12.8
    expect(place(spot(), 1280)).toEqual({ x: 128 + 12.8, y: 300 + 2 })
    // the last tenth of both
    const p = place(spot({ cx: 9, cy: 9 }), 1280)
    expect(p.x).toBeCloseTo(128 + 0.95 * 256)
    expect(p.y).toBeCloseTo(300 + 0.95 * 40)
  })

  it('follows the width the page is drawn at', () => {
    expect(place(spot({ cx: 4, cy: 4 }), 390).x).toBeCloseTo((100 / 1000) * 390 + 0.45 * ((200 / 1000) * 390))
  })
})

describe('how strongly a spot shows', () => {
  it('is the busiest at full, and never fades out', () => {
    expect(strength(100, 100)).toBe(1)
    expect(strength(1, 10000)).toBe(0.18)
    expect(strength(25, 100)).toBe(0.5)
    expect(strength(5, 0)).toBe(0)
  })
  it('finds the busiest', () => {
    expect(busiest([spot({ n: 3 }), spot({ n: 9 }), spot({ n: 4 })])).toBe(9)
    expect(busiest([])).toBe(0)
  })
  it('gives a wide element a wider glow, within bounds', () => {
    expect(glow(spot({ w: 10 }), 1280)).toBe(24)
    expect(glow(spot({ w: 90 }), 1280)).toBeCloseTo(38.4) // a third of its width
    expect(glow(spot({ w: 990 }), 1280)).toBe(56)
  })
})

describe('the page’s size', () => {
  it('is the average window and height, or the bucket’s width and a page’s worth when nothing says', () => {
    expect(pageSize({ width: 1280, window: 1440, height: 5200 })).toEqual({ w: 1440, h: 5200 })
    expect(pageSize({ width: 768, window: 0, height: 0 })).toEqual({ w: 768, h: 3000 })
  })
  it('stays within what a frame can show', () => {
    expect(pageSize({ width: 1280, window: 99999, height: 999999 })).toEqual({ w: 1920, h: 20000 })
    expect(pageSize({ width: 390, window: 10, height: 10 })).toEqual({ w: 320, h: 600 })
  })
  it('is shrunk only when the room is smaller', () => {
    expect(fit(1000, 1280)).toBeCloseTo(0.78125)
    expect(fit(1400, 1280)).toBe(1)
    expect(fit(0, 1280)).toBe(1)
  })
})

describe('the scroll map', () => {
  const reach = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]
  it('is hot where everyone read and cold where few did', () => {
    expect(heatColor(1)).toBe('hsl(0 85% 50% / 0.38)')
    expect(heatColor(0)).toBe('hsl(220 85% 50% / 0.38)')
    expect(heatColor(2)).toBe(heatColor(1))
  })
  it('runs the first screen at full, then follows the share that got that far, to the bottom', () => {
    const g = scrollGradient(reach, 2000, 800)
    expect(g.startsWith('linear-gradient(to bottom, hsl(0 85% 50% / 0.38) 0%, hsl(0 85% 50% / 0.38) 40.00%')).toBe(true)
    expect(g.endsWith(`${heatColor(0.1)} 100.00%)`)).toBe(true)
    expect(g.match(/hsl\(/g)).toHaveLength(12)
  })
  it('says nothing for a page nobody scrolled', () => {
    expect(scrollGradient([], 2000, 800)).toBe('none')
  })
  it('keeps a short page inside itself', () => {
    expect(scrollGradient(reach, 500, 800).startsWith(`linear-gradient(to bottom, ${heatColor(1)} 0%, ${heatColor(1)} 100.00%`)).toBe(true)
  })
})

describe('the frame', () => {
  it('is this server’s frame page for the site and path, escaped, never the site’s own address', () => {
    expect(frameSrc('tkb_x', '/pricing')).toBe('/api/v1/sites/tkb_x/heat-frame?path=%2Fpricing')
    expect(frameSrc('tkb_x', '/#/a b?c')).toBe('/api/v1/sites/tkb_x/heat-frame?path=%2F%23%2Fa%20b%3Fc')
  })
  it('knows the pages that do something by being opened', () => {
    for (const p of ['/logout', '/signout', '/Sign-Out', '/log_off', '/logout?next=/', '/unsubscribe']) expect(isRisky(p), p).toBe(true)
    for (const p of ['/', '/pricing', '/blog/how-to-logout', '/signature', '/login']) expect(isRisky(p), p).toBe(false)
  })
  it('knows which widths have views', () => {
    const m = { widths: [{ width: 390, views: 0 }, { width: 768, views: 4 }, { width: 1280, views: 9 }] } as Pick<HeatMap, 'widths'>
    expect([390, 768, 1280].map((w) => hasViews(m, w as 390))).toEqual([false, true, true])
  })
})

describe('the example', () => {
  it('is the same every time and has everything the overlay draws', () => {
    expect(exampleHeat(1280)).toEqual(exampleHeat(1280))
    for (const w of [390, 768, 1280] as const) {
      const m = exampleHeat(w)
      expect(m.width).toBe(w)
      expect(m.clicks.length).toBeGreaterThan(5)
      expect(m.dead.length).toBeGreaterThan(0)
      expect(m.rage.length).toBeGreaterThan(0)
      expect(m.scroll).toHaveLength(10)
      expect(m.fields.length).toBeGreaterThan(0)
      for (const s of m.clicks) {
        expect(s.cx).toBeLessThan(10)
        expect(s.cy).toBeLessThan(10)
      }
    }
  })
})
