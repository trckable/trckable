import { describe, expect, it } from 'vitest'
import { block, clearTaken, drawLabels, fine } from './labels'
import { land } from './earth'

const ink = { name: 'n', halo: 'h', sea: 's' }

/** A canvas that only remembers which texts were written. */
function recorder() {
  const said: string[] = []
  const c = new Proxy(
    { measureText: (t: string) => ({ width: t.length * 6 }), fillText: (t: string) => said.push(t) },
    { get: (o: Record<string, unknown>, k: string) => (k in o ? o[k] : () => undefined), set: (o: Record<string, unknown>, k: string, v: unknown) => ((o[k] = v), true) },
  )
  return { c: c as unknown as CanvasRenderingContext2D, said }
}

// Over Europe, a 1000 x 700 canvas.
const europe = (zoom: number) => ({ cx: 500, cy: 350, r: 300 * zoom, lat: 50, lon: 10, w: 1000, h: 700 })

describe('the globe detail', () => {
  it('has finer land than the base map', () => {
    expect(fine.land.points).toBeGreaterThan(land.points * 3)
    expect(fine.borders.end.length).toBeGreaterThan(100)
  })
  it('writes the seas from the start, countries from 1.5x and cities from 3x', () => {
    const at1 = recorder()
    clearTaken()
    drawLabels(at1.c, { ...europe(1), r: 300 }, 1, ink)
    expect(at1.said.some((t) => /Ocean|Sea/.test(t))).toBe(true)
    expect(at1.said).not.toContain('Germany')
    const at2 = recorder()
    clearTaken()
    drawLabels(at2.c, europe(2), 2, ink)
    expect(at2.said).toContain('Germany')
    expect(at2.said).not.toContain('Berlin')
    const at4 = recorder()
    clearTaken()
    drawLabels(at4.c, europe(4), 4, ink)
    expect(at4.said).toContain('Berlin')
  })
  it('leaves out a name that a marker covers', () => {
    const free = recorder()
    clearTaken()
    drawLabels(free.c, europe(4), 4, ink)
    expect(free.said).toContain('Berlin')
    // Berlin is at about the middle of the canvas at this view; a marker there takes its place.
    const covered = recorder()
    clearTaken()
    const r = 300 * 4
    const lat = 52.52 * (Math.PI / 180)
    const lon = (13.4 - 10) * (Math.PI / 180)
    const p0 = 50 * (Math.PI / 180)
    const x = 500 + r * Math.cos(lat) * Math.sin(lon)
    const y = 350 - r * (Math.cos(p0) * Math.sin(lat) - Math.sin(p0) * Math.cos(lat) * Math.cos(lon))
    block(x, y, 20)
    drawLabels(covered.c, europe(4), 4, ink)
    expect(covered.said).not.toContain('Berlin')
  })
  it('writes nothing on the far side of the globe', () => {
    const away = recorder()
    clearTaken()
    drawLabels(away.c, { ...europe(4), lat: -30, lon: 170 }, 4, ink)
    expect(away.said).not.toContain('Berlin')
    expect(away.said).not.toContain('Germany')
  })
})
