import { describe, expect, it } from 'vitest'
import { placeHint } from './Hint'

const view = { w: 1200, h: 800 }
const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h })

describe('placeHint', () => {
  it('goes beside a target when there is room', () => {
    const at = placeHint(box(100, 200, 300, 150), 120, view)
    expect(at).toMatchObject({ left: 410, top: 200, width: 300 })
  })
  it('goes under a target at the right edge', () => {
    const at = placeHint(box(900, 200, 280, 100), 120, view)
    expect(at?.top).toBe(310)
    expect((at?.left ?? 0) + (at?.width ?? 0)).toBeLessThanOrEqual(1192)
  })
  it('goes over a target at the bottom', () => {
    const at = placeHint(box(900, 700, 280, 80), 120, view)
    expect(at?.top).toBe(700 - 10 - 120)
  })
  it('is full width on a phone', () => {
    const at = placeHint(box(16, 100, 340, 120), 140, { w: 390, h: 800 })
    expect(at).toMatchObject({ left: 8, width: 374, top: 230 })
  })
  it('keeps under the control row when it has to go over the target', () => {
    const at = placeHint(box(16, 560, 340, 200), 300, { w: 390, h: 800, top: 120 })
    expect(at?.top).toBeGreaterThanOrEqual(128)
  })
  it('hides while the target is off screen', () => expect(placeHint(box(0, 900, 100, 50), 100, view)).toBeNull())
})
