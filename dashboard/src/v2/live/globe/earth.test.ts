import { describe, expect, it } from 'vitest'
import { borders, decode, fillLand, grid, land, type Lines } from './earth'

describe('the earth as data', () => {
  it('reads outlines back: closed rings with a turn, as unit vectors', () => {
    expect(land.end.length).toBeGreaterThan(100)
    expect(land.points).toBeGreaterThan(3000)
    expect(new Set(land.turn)).toEqual(new Set([1, -1]))
    for (let i = 0; i < land.points; i += 97) expect(Math.hypot(land.xyz[3 * i], land.xyz[3 * i + 1], land.xyz[3 * i + 2])).toBeCloseTo(1, 4)
    expect(borders.end.length).toBeGreaterThan(100)
    expect(grid.end.length).toBe(12 + 5)
  })
  it('decodes the text format: steps in quarter degrees, zig-zag, a turn first', () => {
    // 'ABA' is 0,0; 'C' is 1 ('+' turn, then lon +0.25, lat +0.25 and a step of lon -0.25, lat 0).
    const one = decode('+CCBA', true)
    expect(one.points).toBe(2)
    expect(one.turn[0]).toBe(1)
    const lon = (i: number) => Math.atan2(one.xyz[3 * i], one.xyz[3 * i + 2]) * (180 / Math.PI)
    expect(lon(0)).toBeCloseTo(1 / 4 * 1, 1)
    expect(lon(1)).toBeCloseTo(0, 1)
  })
})

/** The area (as a share of the disc) each outline fills, drawn on a recording of the canvas's path calls, arcs walked in small steps. */
function shares(lat: number, lon: number): number[] {
  const out: number[] = []
  let from = 0
  for (let r = 0; r < land.end.length; r++) {
    const to = land.end[r]
    const one: Lines = { ...land, end: Int32Array.from([to - from]), turn: Int8Array.from([land.turn[r]]), xyz: land.xyz.subarray(from * 3, to * 3), points: to - from }
    const pts: number[][] = []
    const c = {
      beginPath() {},
      closePath() {},
      fill() {},
      moveTo: (x: number, y: number) => pts.push([x, y]),
      lineTo: (x: number, y: number) => pts.push([x, y]),
      arc(cx: number, cy: number, rad: number, a0: number, a1: number, ccw: boolean) {
        let d = a1 - a0
        if (ccw) while (d > 0) d -= 2 * Math.PI
        else while (d < 0) d += 2 * Math.PI
        for (let t = 0; t <= 1; t += 0.05) pts.push([cx + rad * Math.cos(a0 + d * t), cy + rad * Math.sin(a0 + d * t)])
      },
    }
    fillLand(c as unknown as CanvasRenderingContext2D, { cx: 0, cy: 0, r: 100, lat, lon }, one)
    let a = 0
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
    out.push(Math.abs(a / 2) / (Math.PI * 1e4))
    from = to
  }
  return out
}

describe('land at the horizon', () => {
  it('closes an outline that goes behind the globe along the near side of the horizon, never round the other way', () => {
    // Over Africa and Europe, over the Americas, over the Pacific, over the south pole: no shape may fill more than the disc, and none the disc's complement.
    for (const [lat, lon] of [[18, 20], [20, -90], [10, -170], [-70, 0], [-20, 140]]) {
      const all = shares(lat, lon)
      expect(Math.max(...all), `${lat},${lon}`).toBeLessThan(0.75)
    }
  })
})
