// The globe's loop, with no React in it: land dots, pins and their pulse all drawn on one canvas, a view that spins on
// its own, a drag with inertia, and hit-testing in plain maths. Only the open popover and the hover tip are DOM, and the
// loop moves those by setting their transform. It runs only while the globe is on screen and the tab is visible, and
// stops (until something wakes it) when nothing moves. A frame builds no objects: the buffers below are made once.
import { reducedMotion } from '../../../lib/motion'
import { flag } from '../../../lib/format'
import { thinning, wrap, type Pin } from './geo'
import { LAND, STEP } from './globeData'

const RAD = Math.PI / 180
/** Degrees per millisecond of the slow spin (about one turn a minute and a half). */
const SPIN = 0.004
/** The spin waits this long after a touch, then eases back in over the next stretch. */
const REST_MS = 3000
const EASE_MS = 1500
const POP_MS = 480
const PULSE_MS = 1600
const LEAVE_MS = 600
/** A pin's tap target, in CSS pixels across. */
const HIT = 44
const CARD = 32
/** How far in the globe zooms. */
const ZOOM_MIN = 1
const ZOOM_MAX = 6
/** Under this stage width the popover is a sheet over the foot of the globe, not beside the pin. */
const SHEET_W = 700
/** Room the open popover takes beside its pin. */
const POP_W = 420

/** The land as dots, worked out once: for each its cosine and sine of latitude and its longitude. */
const DOTS = (() => {
  const n = LAND.reduce((t, runs) => t + runs.filter((_, i) => i % 2).reduce((a, b) => a + b, 0), 0)
  const out = new Float32Array(n * 3)
  let k = 0
  LAND.forEach((runs, i) => {
    const lat = (84 - STEP / 2 - i * STEP) * RAD
    const cols = Math.max(1, Math.round((360 / STEP) * Math.cos(lat)))
    for (let r = 0; r < runs.length; r += 2) {
      for (let j = runs[r]; j < runs[r] + runs[r + 1]; j++) {
        out[k++] = Math.cos(lat)
        out[k++] = Math.sin(lat)
        out[k++] = -180 + ((j + 0.5) * 360) / cols
      }
    }
  })
  return out
})()

interface State {
  pin: Pin
  born: number
  pulse: number
  gone: number
  /** Where it was drawn last frame (CSS pixels) and how visible, for the hit test. */
  x: number
  y: number
  a: number
}

export interface Hooks {
  onPick: (key: string) => void
  onHover: (key: string | null) => void
  onSheet: (on: boolean) => void
}

/** A DOM element (the popover or the tip) that follows a spot on the globe. */
export interface Follow {
  /** Where to find it in the stage: it is rendered by React, and found here once it is there. */
  sel: string
  el: HTMLElement | null
  key: string | null
  lat: number
  lon: number
  x: number
  y: number
}

const follower = (sel: string): Follow => ({ sel, el: null, key: null, lat: 0, lon: 0, x: -1, y: -1 })
const ease = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2)

export class Globe {
  lat = 18
  lon = 10
  /** The spot (pin key) drawn with a ring: the one picked from the list or by keyboard. */
  mark: string | null = null
  /** Frames drawn, the time they took in all, and the longest (read by the performance check). */
  stats = { frames: 0, ms: 0, max: 0 }
  readonly pop = follower('.gpop')
  readonly tip = follower('.gtip')
  private ctx: CanvasRenderingContext2D | null
  private w = 0
  private h = 0
  private dpr = 1
  private raf = 0
  private last = 0
  private still = 0
  private vx = 0
  private vy = 0
  /** True while a pin is open: the globe does not spin. */
  held = false
  private onScreen = true
  private sheet = false
  private cx = 0
  private cy = 0
  /** The zoom now, and where it is heading: it eases between the two. */
  zoom = 1
  zoomT = 1
  private ptrs = new Map<number, { x: number; y: number }>()
  private pinch = { on: false, d0: 1, z0: 1 }
  private tap = { t: 0, x: 0, y: 0 }
  private moved = false
  private first = true
  private target = { on: false, lat: 0, lon: 0 }
  private drag = { on: false, id: 0, x: 0, y: 0, t: 0 }
  private states: State[] = []
  private hover: string | null = null
  private sprites = new Map<string, HTMLCanvasElement>()
  private ink = { dot: '', edge: '', body: '', card: '', lime: '', bg: '', ring: '' }
  private inkAt = -9999
  private thin: 1 | 2 = 1
  private motion: MediaQueryList | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: Hooks,
  ) {
    this.ctx = canvas.getContext('2d')
    ;(canvas as HTMLCanvasElement & { __globe?: Globe }).__globe = this
    document.addEventListener('visibilitychange', this.wake)
    this.motion = matchMedia('(prefers-reduced-motion: reduce)')
    this.motion.addEventListener('change', this.wake)
  }

  /** The size in CSS pixels. The picture follows the screen's density, never above two, and one on a weak device. */
  resize(w: number, h: number) {
    this.w = w
    this.h = h
    this.cx = w / 2
    this.cy = h / 2
    if (this.sheet !== w < SHEET_W) this.hooks.onSheet((this.sheet = w < SHEET_W))
    const nav = navigator as Navigator & { deviceMemory?: number }
    const weak = (navigator.hardwareConcurrency || 8) <= 4 || (matchMedia('(pointer: coarse)').matches && w < 900)
    this.thin = weak || thinning(w, navigator.hardwareConcurrency || 8, nav.deviceMemory ?? 8) === 2 ? 2 : 1
    this.dpr = weak ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(w * this.dpr)
    this.canvas.height = Math.round(h * this.dpr)
    this.sprites.clear()
    this.wake()
  }

  setOnScreen(on: boolean) {
    this.onScreen = on
    this.wake()
  }

  /** The people at the spots now. A new spot pops in, a spot with a new arrival pulses, a spot that emptied shrinks away. The first set only appears. */
  setPins(pins: readonly Pin[]) {
    const now = performance.now()
    const by = new Map(this.states.map((s) => [s.pin.key, s]))
    const seen = new Set<string>()
    for (const p of pins) {
      seen.add(p.key)
      const s = by.get(p.key)
      if (!s) this.states.push({ pin: p, born: this.first ? -1e9 : now, pulse: -1e9, gone: 0, x: 0, y: 0, a: 0 })
      else {
        if (s.pin.sig !== p.sig && !s.gone) s.pulse = now
        s.pin = p
        s.gone = 0
      }
    }
    for (const s of this.states) if (!seen.has(s.pin.key) && !s.gone) s.gone = now
    this.first = false
    this.wake()
  }

  /** Starts the loop if it is not running (a pin came or went, the size changed, the tab came back). */
  wake = () => {
    if (this.raf || document.hidden || !this.onScreen) return
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  private radius = () => Math.min(this.w, this.h) * 0.46 * this.zoom

  /** Brings a point to the middle of the view. */
  focus(lat: number, lon: number) {
    this.target.on = true
    this.target.lat = Math.max(-55, Math.min(55, lat))
    this.target.lon = lon
    this.vx = this.vy = 0
    this.wake()
  }

  /** The point of the sphere under a screen point (CSS pixels from the stage's corner), or null off the globe. */
  private under(px: number, py: number): { lat: number; lon: number } | null {
    const R = this.radius()
    const x = (px - this.cx) / R
    const y = -(py - this.cy) / R
    const rho = Math.hypot(x, y)
    if (rho > 1) return null
    if (rho < 1e-6) return { lat: this.lat, lon: this.lon }
    const c = Math.asin(rho)
    const p0 = this.lat * RAD
    return { lat: Math.asin(Math.cos(c) * Math.sin(p0) + (y * Math.sin(c) * Math.cos(p0)) / rho) / RAD, lon: this.lon + Math.atan2(x * Math.sin(c), rho * Math.cos(p0) * Math.cos(c) - y * Math.sin(p0) * Math.sin(c)) / RAD }
  }

  /** Zooms to a level (kept within 1x to 6x), easing; zooming in with a point brings the place under it to the middle. Zoomed in, the globe does not spin; back at 1x it does after a second. */
  zoomTo(z: number, px?: number, py?: number) {
    const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
    if (px !== undefined && py !== undefined && nz > this.zoomT) {
      const at = this.under(px, py)
      if (at) this.focus(at.lat, at.lon)
    }
    this.zoomT = nz
    if (nz <= 1.02) this.still = performance.now() - REST_MS + 1000
    this.wake()
  }

  zoomBy(f: number, px?: number, py?: number) {
    this.zoomTo(this.zoomT * f, px, py)
  }

  /** While held the globe does not spin; letting go starts it again after about a second. */
  hold(on: boolean) {
    this.held = on
    if (!on) this.still = performance.now() - REST_MS + 1000
    this.wake()
  }

  down(e: PointerEvent, rect: DOMRect) {
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.ptrs.size === 2) {
      // A second finger: a pinch. The drag stops, and the press is no tap.
      const [a, b] = [...this.ptrs.values()]
      this.drag.on = false
      this.moved = true
      this.pinch.on = true
      this.pinch.d0 = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y))
      this.pinch.z0 = this.zoomT
      const at = this.under((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top)
      if (at) this.focus(at.lat, at.lon)
      return
    }
    if (this.drag.on || this.pinch.on) return
    this.moved = false
    this.target.on = false
    this.drag.on = true
    this.drag.id = e.pointerId
    this.drag.x = e.clientX
    this.drag.y = e.clientY
    this.drag.t = e.timeStamp
    this.vx = this.vy = 0
    this.still = performance.now()
  }

  /** Returns true once the press has become a drag (far enough to not be a tap). */
  move(e: PointerEvent, rect: DOMRect): boolean {
    const known = this.ptrs.get(e.pointerId)
    if (known) {
      known.x = e.clientX
      known.y = e.clientY
    }
    if (this.pinch.on && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()]
      this.zoomTo((this.pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch.d0)
      return true
    }
    const d = this.drag
    if (!d.on) {
      if (e.pointerType === 'mouse') this.look(e.clientX - rect.left, e.clientY - rect.top)
      return false
    }
    if (d.id !== e.pointerId) return this.moved
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    const dt = Math.max(1, e.timeStamp - d.t)
    if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true
    if (this.moved) {
      this.turn(dx, dy)
      // The speed the finger left with, smoothed, for the glide after.
      this.vx = this.vx * 0.5 + (dx / dt) * 0.5
      this.vy = this.vy * 0.5 + (dy / dt) * 0.5
      d.x = e.clientX
      d.y = e.clientY
      d.t = e.timeStamp
      this.still = performance.now()
      this.wake()
    }
    return this.moved
  }

  /** The press ended: a tap on a pin picks it; a drag glides on. */
  up(e: PointerEvent, rect: DOMRect) {
    this.ptrs.delete(e.pointerId)
    if (this.pinch.on) {
      if (this.ptrs.size < 2) this.pinch.on = false
      return
    }
    const d = this.drag
    if (!d.on || d.id !== e.pointerId) return
    d.on = false
    if (!this.moved) {
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      // Two taps close together zoom in on the spot; one picks a pin.
      if (e.timeStamp - this.tap.t < 320 && Math.hypot(px - this.tap.x, py - this.tap.y) < 30) {
        this.tap.t = 0
        this.zoomBy(2.2, px, py)
      } else {
        this.tap.t = e.timeStamp
        this.tap.x = px
        this.tap.y = py
        const k = this.hit(px, py)
        if (k) this.hooks.onPick(k)
      }
      this.vx = this.vy = 0
    } else if (e.timeStamp - d.t > 80) this.vx = this.vy = 0
    this.still = performance.now()
    this.wake()
  }

  /** The size of a pin, by how many there are: whole up to 60, then smaller down to a third. */
  private density(): number {
    return Math.max(0.35, Math.min(1, Math.sqrt(60 / Math.max(1, this.states.length))))
  }

  /** The pin whose tap target holds the point, the nearest if several. */
  hit(px: number, py: number): string | null {
    let best: string | null = null
    const reach = Math.max(10, (HIT / 2) * this.density())
    let bd = reach * reach
    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i]
      if (s.a < 0.3 || s.gone) continue
      const d = (s.x - px) * (s.x - px) + (s.y - py) * (s.y - py)
      if (d < bd) {
        bd = d
        best = s.pin.key
      }
    }
    return best
  }

  private look(px: number, py: number) {
    const k = this.hit(px, py)
    if (k === this.hover) return
    this.hover = k
    this.canvas.style.cursor = k ? 'pointer' : ''
    this.hooks.onHover(k)
  }

  /** Moves the popover or tip to where its pin is on the canvas now (the last place it knew, once the pin has left). */
  private follow(f: Follow, R: number, cx: number, cy: number, sp: number, cp: number) {
    if (!f.key) {
      f.el = null
      return
    }
    if (!f.el?.isConnected) {
      f.el = this.canvas.parentElement?.querySelector<HTMLElement>(f.sel) ?? null
      f.x = -1
    }
    if (!f.el) return
    let seen: State | null = null
    for (let i = 0; i < this.states.length; i++) {
      if (this.states[i].pin.key === f.key) {
        f.lat = this.states[i].pin.lat
        f.lon = this.states[i].pin.lon
        if (!this.states[i].gone) seen = this.states[i]
      }
    }
    const p = f.lat * RAD
    const dl = (f.lon - this.lon) * RAD
    // On the screen where its pin was drawn (spread included), else where its place is.
    const x = seen ? seen.x : cx + R * Math.cos(p) * Math.sin(dl)
    const y = seen ? seen.y : cy - R * (cp * Math.sin(p) - sp * Math.cos(p) * Math.cos(dl))
    if (Math.abs(x - f.x) < 0.25 && Math.abs(y - f.y) < 0.25) return
    f.x = x
    f.y = y
    f.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`
  }

  private turn(dx: number, dy: number) {
    const k = 1 / (RAD * Math.max(1, this.radius()))
    this.lon = wrap(this.lon - dx * k)
    this.lat = Math.max(-70, Math.min(70, this.lat + dy * k))
  }

  private tick = (now: number) => {
    this.raf = 0
    const t0 = performance.now()
    const dt = Math.min(64, now - this.last)
    this.last = now
    const reduced = reducedMotion()
    let moving = false
    if (this.drag.on) moving = true
    else if (Math.abs(this.vx) + Math.abs(this.vy) > 0.002) {
      this.turn(this.vx * dt, this.vy * dt)
      const f = Math.exp(-dt / 350)
      this.vx *= f
      this.vy *= f
      moving = true
    } else if (this.target.on) {
      const t = this.target
      const dl = wrap(t.lon - this.lon)
      const k = reduced ? 1 : 1 - Math.exp(-dt / 160)
      this.lat += (t.lat - this.lat) * k
      this.lon = wrap(this.lon + dl * k)
      if (Math.abs(dl) + Math.abs(t.lat - this.lat) < 0.1) t.on = false
      moving = true
    } else if (!reduced && !this.held && this.zoomT <= 1.02) {
      const k = Math.max(0, Math.min(1, (now - this.still - REST_MS) / EASE_MS))
      if (k > 0) this.lon = wrap(this.lon + SPIN * dt * k * k * (3 - 2 * k))
      moving = true
    }
    if (Math.abs(this.zoomT - this.zoom) > 0.002) {
      this.zoom = reduced ? this.zoomT : this.zoom + (this.zoomT - this.zoom) * (1 - Math.exp(-dt / 110))
      if (Math.abs(this.zoomT - this.zoom) <= 0.002) this.zoom = this.zoomT
      moving = true
    }
    // An open popover takes room beside its pin (or under it, as a sheet): the globe slides aside to make it.
    const R = this.radius()
    const tx = this.held && !this.sheet ? Math.min(this.w / 2, Math.max(R + 12, this.w - POP_W - 12)) : this.w / 2
    const ty = this.held && this.sheet ? this.h * 0.3 : this.h / 2
    if (Math.abs(tx - this.cx) + Math.abs(ty - this.cy) > 0.4) {
      const k = reduced ? 1 : 1 - Math.exp(-dt / 160)
      this.cx += (tx - this.cx) * k
      this.cy += (ty - this.cy) * k
      moving = true
    }
    const animating = this.draw(now, reduced)
    if ((moving || animating) && !document.hidden && this.onScreen) this.raf = requestAnimationFrame(this.tick)
    const ms = performance.now() - t0
    this.stats.frames++
    this.stats.ms += ms
    if (ms > this.stats.max) this.stats.max = ms
  }

  /** The page's colours, read from its theme tokens about once a second (a theme change shows within it). */
  private colours(now: number) {
    if (now - this.inkAt < 1000) return this.ink
    this.inkAt = now
    const s = getComputedStyle(this.canvas)
    const v = (n: string) => s.getPropertyValue(n).trim()
    const was = this.ink.card + this.ink.lime
    this.ink = { dot: v('--mk-muted'), edge: v('--mk-line'), body: v('--mk-card2'), card: v('--mk-card'), lime: v('--mk-lime'), bg: v('--mk-bg'), ring: v('--mk-limeM') }
    if (was !== this.ink.card + this.ink.lime) this.sprites.clear()
    return this.ink
  }

  /** A pin's picture, made once per country: a disc with the flag. */
  private sprite(cc: string): HTMLCanvasElement {
    let c = this.sprites.get(cc)
    if (c) return c
    c = document.createElement('canvas')
    c.width = c.height = Math.round(CARD * this.dpr)
    const x = c.getContext('2d')
    if (x) {
      x.scale(this.dpr, this.dpr)
      x.shadowColor = this.ink.edge
      x.shadowBlur = 4
      x.fillStyle = this.ink.card
      x.beginPath()
      x.arc(CARD / 2, CARD / 2, 12, 0, Math.PI * 2)
      x.fill()
      x.shadowBlur = 0
      x.font = '14px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
      x.textAlign = 'center'
      x.textBaseline = 'middle'
      x.fillStyle = this.ink.dot
      x.fillText(flag(cc), CARD / 2, CARD / 2 + 1)
    }
    this.sprites.set(cc, c)
    return c
  }

  /** One draw: the sphere, its land, then the pins. Says whether a pin is still animating (the loop must go on). */
  private draw(now: number, reduced: boolean): boolean {
    const c = this.ctx
    if (!c || !this.w) return false
    const ink = this.colours(now)
    const R = this.radius()
    const cx = this.cx
    const cy = this.cy
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.clearRect(0, 0, this.w, this.h)
    c.beginPath()
    c.arc(cx, cy, R, 0, Math.PI * 2)
    c.fillStyle = ink.body
    c.fill()
    c.lineWidth = 1
    c.strokeStyle = ink.edge
    c.stroke()
    const sp = Math.sin(this.lat * RAD)
    const cp = Math.cos(this.lat * RAD)
    const size = Math.max(1.4, R / this.zoom / 150) * Math.min(this.zoom, 3.5) * (this.thin === 2 ? 1.35 : 1)
    c.fillStyle = ink.dot
    // Two passes by facing: the rim fainter than the middle, so the sphere reads as round.
    for (let pass = 0; pass < 2; pass++) {
      const lo = pass ? 0.3 : 0.02
      const hi = pass ? 1.01 : 0.3
      c.globalAlpha = pass ? 0.9 : 0.35
      for (let i = 0; i < DOTS.length; i += 3 * this.thin) {
        const dl = (DOTS[i + 2] - this.lon) * RAD
        const cd = Math.cos(dl)
        const z = sp * DOTS[i + 1] + cp * DOTS[i] * cd
        if (z < lo || z >= hi) continue
        const x = cx + R * DOTS[i] * Math.sin(dl) - size / 2
        const y = cy - R * (cp * DOTS[i + 1] - sp * DOTS[i] * cd) - size / 2
        if (x < -size || x > this.w || y < -size || y > this.h) continue
        c.fillRect(x, y, size, size)
      }
    }
    c.globalAlpha = 1
    let animating = false
    // A crowd draws smaller dots, one each, so they can sit close without hiding one another.
    const dense = this.density()
    for (let i = this.states.length - 1; i >= 0; i--) {
      const s = this.states[i]
      if (s.gone && now - s.gone > LEAVE_MS) {
        this.states[i] = this.states[this.states.length - 1]
        this.states.pop()
        continue
      }
      const p = s.pin.lat * RAD
      const dl = (s.pin.lon - this.lon) * RAD
      const cd = Math.cos(dl)
      const z = sp * Math.sin(p) + cp * Math.cos(p) * cd
      // Zoomed in, a crowd at one spot also spreads on the screen, each by their own place around it.
      // At 1x a crowd already opens out enough that each flag can be seen and tapped (14 px a head, to 70); zooming in opens it further.
      const open = Math.min(70, 14 * Math.sqrt(Math.max(0, s.pin.crowd - 1))) * (1 + (this.zoom - 1) / 2.5)
      s.x = cx + R * Math.cos(p) * Math.sin(dl) + (s.pin.crowd > 1 ? s.pin.ux * open : 0)
      s.y = cy - R * (cp * Math.sin(p) - sp * Math.cos(p) * cd) + (s.pin.crowd > 1 ? s.pin.uy * open : 0)
      let a = z > 0.05 ? Math.min(1, z * 4) : 0
      let sc = 1
      const born = reduced ? 1 : (now - s.born) / POP_MS
      if (born < 1) {
        sc = ease(Math.max(0, born))
        animating = true
      }
      if (s.gone) {
        const k = reduced ? 1 : (now - s.gone) / LEAVE_MS
        sc *= Math.max(0.2, 1 - k)
        a *= Math.max(0, 1 - k)
        animating = true
      }
      s.a = a
      if (a <= 0.01 || s.x < -CARD || s.x > this.w + CARD || s.y < -CARD || s.y > this.h + CARD) continue
      const pulse = (now - s.pulse) / PULSE_MS
      if (!reduced && pulse < 1 && !s.gone) {
        c.globalAlpha = a * 0.7 * (1 - pulse)
        c.fillStyle = ink.ring
        c.beginPath()
        c.arc(s.x, s.y, (12 + pulse * 22) * dense, 0, Math.PI * 2)
        c.fill()
        animating = true
      }
      c.globalAlpha = a
      if (this.mark === s.pin.key) {
        c.lineWidth = 2
        c.strokeStyle = ink.lime
        c.beginPath()
        c.arc(s.x, s.y, 15 * dense, 0, Math.PI * 2)
        c.stroke()
      }
      const half = (CARD / 2) * sc * dense
      c.drawImage(this.sprite(s.pin.cc), s.x - half, s.y - half, CARD * sc * dense, CARD * sc * dense)
    }
    c.globalAlpha = 1
    this.follow(this.pop, R, cx, cy, sp, cp)
    this.follow(this.tip, R, cx, cy, sp, cp)
    return animating
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    document.removeEventListener('visibilitychange', this.wake)
    this.motion?.removeEventListener('change', this.wake)
  }
}
