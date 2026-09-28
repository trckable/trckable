// The crop's geometry, apart from the screen so it can be tested. Positions
// are the offset of the picture's centre from the frame's centre, in frame
// pixels. Zoom 1 fits the whole picture inside the frame ("contain"); the
// zoom at which it just covers the frame is `cover`.

export const VIEW = 240 // the frame on screen
export const OUT = 256 // the saved picture
export const STEP = 10 // an arrow key's move; with Shift, four times that

export type Point = { x: number; y: number }

/** The zoom that covers the frame, and the most it may be zoomed. */
export function zoomRange(iw: number, ih: number) {
  const cover = Math.max(iw, ih) / Math.min(iw, ih)
  return { min: 1, cover, max: Math.max(4, cover * 4) }
}

/** The picture's size in frame pixels at a zoom. */
export function sized(iw: number, ih: number, zoom: number, view = VIEW) {
  const k = (view / Math.max(iw, ih)) * zoom
  return { w: iw * k, h: ih * k }
}

// Along one axis: a picture wider than the frame may not show a gap at either
// edge; a narrower one may not leave the frame. Either way it stays in view.
const limit = (v: number, size: number, view: number) => {
  const room = Math.abs(size - view) / 2
  return Math.min(room, Math.max(-room, v)) + 0 // + 0 turns -0 into 0
}

export function clamp(p: Point, w: number, h: number, view = VIEW): Point {
  return { x: limit(p.x, w, view), y: limit(p.y, h, view) }
}

/** Keeps the point under the frame's centre there while the zoom changes. */
export function rezoom(p: Point, from: number, to: number): Point {
  return { x: (p.x * to) / from, y: (p.y * to) / from }
}

/** An arrow key's move, or null for any other key. */
export function nudge(key: string, shift: boolean): Point | null {
  const d = shift ? STEP * 4 : STEP
  const moves: Record<string, Point> = {
    ArrowLeft: { x: -d, y: 0 },
    ArrowRight: { x: d, y: 0 },
    ArrowUp: { x: 0, y: -d },
    ArrowDown: { x: 0, y: d },
  }
  return moves[key] ?? null
}

/** Where the picture lands in a frame: its top-left corner and size. */
export function placed(w: number, h: number, p: Point, view = VIEW) {
  return { x: view / 2 - w / 2 + p.x, y: view / 2 - h / 2 + p.y, w, h }
}

/** The same rectangle on the saved canvas, so what is saved is what is seen. */
export function drawRect(w: number, h: number, p: Point, view = VIEW, out = OUT) {
  const r = placed(w, h, p, view)
  const k = out / view
  return { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }
}

export const clampZoom = (z: number, max: number) => Math.min(max, Math.max(1, z))
