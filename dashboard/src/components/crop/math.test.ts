import { describe, expect, it } from 'vitest'
import { clamp, clampZoom, drawRect, nudge, rezoom, sized, zoomRange } from './math'

describe('crop maths', () => {
  it('fits a wide logo whole at the lowest zoom', () => {
    const { w, h } = sized(1000, 250, 1, 240)
    expect(w).toBe(240)
    expect(h).toBe(60)
  })

  it('covers the frame at the cover zoom', () => {
    const r = zoomRange(1000, 250)
    expect(r.cover).toBe(4)
    expect(r.max).toBe(16)
    expect(sized(1000, 250, r.cover, 240).h).toBe(240)
    expect(zoomRange(500, 500)).toEqual({ min: 1, cover: 1, max: 4 })
  })

  it('keeps a small picture inside the frame', () => {
    // 240 × 60: no room across, 90 up and down.
    expect(clamp({ x: 50, y: 500 }, 240, 60, 240)).toEqual({ x: 0, y: 90 })
    expect(clamp({ x: -50, y: -500 }, 240, 60, 240)).toEqual({ x: 0, y: -90 })
  })

  it('never shows a gap beside a picture larger than the frame', () => {
    expect(clamp({ x: 999, y: -999 }, 480, 300, 240)).toEqual({ x: 120, y: -30 })
    expect(clamp({ x: 10, y: 5 }, 480, 300, 240)).toEqual({ x: 10, y: 5 })
  })

  it('zooms about the centre', () => {
    expect(rezoom({ x: 10, y: -20 }, 1, 2)).toEqual({ x: 20, y: -40 })
  })

  it('moves with the arrow keys, further with Shift', () => {
    expect(nudge('ArrowLeft', false)).toEqual({ x: -10, y: 0 })
    expect(nudge('ArrowDown', true)).toEqual({ x: 0, y: 40 })
    expect(nudge('a', false)).toBeNull()
  })

  it('saves exactly what the frame shows', () => {
    // Centred and contained: a band across the middle, empty above and below.
    expect(drawRect(240, 60, { x: 0, y: 0 }, 240, 256)).toEqual({ x: 0, y: 96, w: 256, h: 64 })
    // Moved right by half a frame at double size.
    expect(drawRect(480, 480, { x: 120, y: 0 }, 240, 240)).toEqual({ x: 0, y: -120, w: 480, h: 480 })
  })

  it('holds the zoom to its range', () => {
    expect(clampZoom(0.2, 4)).toBe(1)
    expect(clampZoom(9, 4)).toBe(4)
  })
})
