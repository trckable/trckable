import { describe, expect, it } from 'vitest'
import { placePop } from './popPlace'

const view = { w: 1280, h: 720 }
const pop = { w: 288, h: 300 }

describe('where a popover goes', () => {
  it('hangs under its button when it fits there, with the rest of the window as its room', () => {
    const at = placePop({ top: 100, bottom: 140, right: 600 }, pop, view)
    expect(at).toEqual({ left: 312, top: 146, room: 566 })
  })

  it('stands on its button when it only fits above, so it grows upwards', () => {
    const at = placePop({ top: 600, bottom: 640, right: 600 }, pop, view)
    expect(at).toEqual({ left: 312, bottom: 126, room: 586 })
    expect(at.top).toBeUndefined()
  })

  it('goes over the button from the top when neither side has room', () => {
    const at = placePop({ top: 200, bottom: 240, right: 600 }, { w: 288, h: 420 }, { w: 1280, h: 480 })
    expect(at).toEqual({ left: 312, top: 8, room: 464 })
  })

  it('never takes more height than the side it is on has: the list scrolls instead of leaving the window', () => {
    // It opened on a short list; the button is low, so it is above, and may grow to the button's top.
    const at = placePop({ top: 500, bottom: 540, right: 600 }, { w: 288, h: 160 }, view)
    expect(at.bottom).toBe(226)
    expect(at.room).toBe(486)
    expect(at.room + (at.bottom ?? 0)).toBeLessThanOrEqual(view.h - 8)
  })

  it('stays inside the window sideways', () => {
    expect(placePop({ top: 100, bottom: 140, right: 100 }, pop, view).left).toBe(8)
    expect(placePop({ top: 100, bottom: 140, right: 1400 }, pop, view).left).toBe(984)
  })
})
