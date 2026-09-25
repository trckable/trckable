// The share card as a GIF: the same card, drawn frame by frame in this
// browser — the number counts up, the line draws, the rest fades in — then
// holds and loops. Its own chunk with the encoder (gifenc, MIT), loaded the
// first time someone presses GIF, so nobody else pays for it.
import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import { cardSvg, SIZES, type Design, type Look, type ShareData } from './ShareCard'

// Smaller than the picture: a GIF stores every frame, and 256 colours per
// frame never look sharper than this anyway.
const WIDTH = { post: 800, square: 720, story: 540 }
const FRAMES = 36 // 1.8 s at 50 ms
const STEP = 50
const HOLD = 3200 // the finished card, before it starts again

export async function cardGif(d: ShareData, design: Design, look: Look, title: string, onProgress: (share: number) => void): Promise<Blob> {
  const { w: W, h: H } = SIZES[look.format]
  const w = WIDTH[look.format]
  const h = Math.round((H / W) * w)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const gif = GIFEncoder()
  for (let i = 0; i <= FRAMES; i++) {
    await draw(cardSvg(d, design, look, title, i / FRAMES), ctx, w, h)
    const rgba = ctx.getImageData(0, 0, w, h).data
    dither(rgba, w)
    const palette = quantize(rgba, 256)
    gif.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay: i === 0 ? 300 : i === FRAMES ? HOLD : STEP })
    onProgress((i + 1) / (FRAMES + 1))
    // Let the dialog breathe between frames: the bar moves, clicks still work.
    await new Promise((r) => setTimeout(r, 0))
  }
  gif.finish()
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' })
}

// A 4 × 4 ordered dither of about one colour step, so the glow and the soft
// fill under the line fade instead of breaking into bands at 256 colours.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
function dither(rgba: Uint8ClampedArray, w: number) {
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const n = (BAYER[((p / w) & 3) * 4 + (p % w & 3)] / 16 - 0.47) * 9
    rgba[i] += n // a Uint8ClampedArray keeps each channel inside 0–255
    rgba[i + 1] += n
    rgba[i + 2] += n
  }
}

async function draw(svg: string, ctx: CanvasRenderingContext2D, w: number, h: number) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok()
      img.onerror = () => bad(new Error('The GIF could not be drawn in this browser.'))
      img.src = url
    })
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
  } finally {
    URL.revokeObjectURL(url)
  }
}
