// The globe's loop, with no React in it: the earth (earth.ts), the visitors' markers and their pulse all drawn on one canvas, a view that spins on
// its own, a drag with inertia, and hit-testing in plain maths. Only the open popover and the hover tip are DOM, and the
// loop moves those by setting their transform. It runs only while the globe is on screen and the tab is visible, and
// stops (until something wakes it) when nothing moves. A frame builds no objects: the buffers below are made once.
import { reducedMotion } from '../../../lib/motion'
import { borders, fillLand, grid, strokeLines } from './earth'
import { spotsOf, wrap, type Pin } from './geo'

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

/** The colours the globe draws with, from the page's tokens. */
interface Ink {
  edge: string
  card: string
  lime: string
  bg: string
  ring: string
  sea: string
  deep: string
  shade: string
  fade: string
  land: string
  coast: string
  grat: string
  air: string
  airFade: string
  glowEnd: string
}

/** One marker: everyone at one spot (a country, or a city of it) is one glowing dot with their number. */
interface State {
  /** The newest of them: a tap opens this visitor, the tip tells their page. */
  pin: Pin
  /** Every visitor key at the spot (a pick, a keyboard step or the open card on any of them marks it). */
  members: string[]
  count: number
  /** The spot's own place, where the marker sits (the visitors' small spreads are not used). */
  lat: number
  lon: number
  label: string
  born: number
  pulse: number
  gone: number
  /** What changes when someone arrives or acts at the spot (the pulse keys on it). */
  sig: string
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
  private ink: Ink = { edge: '', card: '', lime: '', bg: '', ring: '', sea: '', deep: '', shade: '', fade: '', land: '', coast: '', grat: '', air: '', airFade: '', glowEnd: '' }
  private inkAt = -9999
  /** The shading of the sphere (sea, its dark rim, the glow of the air): made again only when the place, the size or the colours change. */
  private shell: { key: string; sea: CanvasGradient; rim: CanvasGradient; air: CanvasGradient } | null = null
  /** A soft glow, drawn once and scaled under each marker. */
  private glow: HTMLCanvasElement | null = null
  /** The busiest spot is faced once, when the first people arrive. */
  private faced = false
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
    const weak = (navigator.hardwareConcurrency || 8) <= 4 || (matchMedia('(pointer: coarse)').matches && w < 900)
    this.dpr = weak ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(w * this.dpr)
    this.canvas.height = Math.round(h * this.dpr)
    this.shell = null
    this.wake()
  }

  setOnScreen(on: boolean) {
    this.onScreen = on
    this.wake()
  }

  /** The people at the spots now, one marker for each spot. A new spot pops in, a spot with a new arrival pulses, a spot that emptied shrinks away. The first set only appears, and the globe turns to face the busiest spot. */
  setPins(pins: readonly Pin[]) {
    const now = performance.now()
    const spots = spotsOf(pins)
    const by = new Map(this.states.map((s) => [`${s.pin.cc}/${s.pin.city}`, s]))
    const seen = new Set<string>()
    let busiest: State | null = null
    for (const [k, g] of spots) {
      seen.add(k)
      const count = g.members.length
      const sig = `${count}:${g.lead.sig}`
      let s = by.get(k)
      if (!s) {
        s = { pin: g.lead, members: g.members, count, lat: g.lead.lat, lon: g.lead.lon, label: count > 99 ? '99+' : String(count), sig, born: this.first ? -1e9 : now, pulse: -1e9, gone: 0, x: 0, y: 0, a: 0 }
        this.states.push(s)
      } else {
        if (s.sig !== sig && !s.gone) s.pulse = now
        s.pin = g.lead
        s.members = g.members
        s.count = count
        s.lat = g.lead.lat
        s.lon = g.lead.lon
        s.label = count > 99 ? '99+' : String(count)
        s.sig = sig
        s.gone = 0
      }
      if (!busiest || count > busiest.count || (count === busiest.count && g.lead.last > busiest.pin.last)) busiest = s
    }
    for (const s of this.states) if (!seen.has(`${s.pin.cc}/${s.pin.city}`) && !s.gone) s.gone = now
    if (busiest && !this.faced) {
      this.faced = true
      this.lat = Math.max(-55, Math.min(55, busiest.lat))
      this.lon = busiest.lon
    }
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
      if (this.states[i].members.includes(f.key)) {
        f.lat = this.states[i].lat
        f.lon = this.states[i].lon
        if (!this.states[i].gone) seen = this.states[i]
      }
    }
    const p = f.lat * RAD
    const dl = (f.lon - this.lon) * RAD
    // On the screen where its marker was drawn, else where its place is.
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
    const was = Object.values(this.ink).join()
    this.ink = { edge: v('--mk-line'), card: v('--mk-card'), lime: v('--mk-lime'), bg: v('--mk-bg'), ring: v('--mk-limeM'), sea: v('--mk-sea'), deep: v('--mk-sea-deep'), shade: v('--mk-sea-shade'), fade: v('--mk-sea-fade'), land: v('--mk-land'), coast: v('--mk-land-line'), grat: v('--mk-grat'), air: v('--mk-air'), airFade: v('--mk-air-fade'), glowEnd: v('--mk-lime0') }
    if (was !== Object.values(this.ink).join()) {
      this.shell = null
      this.glow = null
    }
    return this.ink
  }

  /** The sphere's shading for this place and size: the sea lit from the upper left, a darker rim, and the thin glow of the air around it. */
  private shading(c: CanvasRenderingContext2D, ink: Ink, R: number) {
    const key = `${Math.round(this.cx)},${Math.round(this.cy)},${Math.round(R)}`
    if (this.shell?.key === key) return this.shell
    const x = this.cx
    const y = this.cy
    const sea = c.createRadialGradient(x - R * 0.38, y - R * 0.42, R * 0.04, x, y, R * 1.08)
    sea.addColorStop(0, ink.sea)
    sea.addColorStop(1, ink.deep)
    const rim = c.createRadialGradient(x, y, R * 0.66, x, y, R)
    rim.addColorStop(0, ink.fade)
    rim.addColorStop(1, ink.shade)
    const air = c.createRadialGradient(x, y, R * 0.97, x, y, R * 1.12)
    air.addColorStop(0, ink.air)
    air.addColorStop(1, ink.airFade)
    this.shell = { key, sea, rim, air }
    return this.shell
  }

  /** A marker's glow: one soft round light in the accent, made once. */
  private light(ink: Ink): HTMLCanvasElement {
    if (this.glow) return this.glow
    const g = document.createElement('canvas')
    g.width = g.height = 64
    const x = g.getContext('2d')
    if (x) {
      const r = x.createRadialGradient(32, 32, 0, 32, 32, 32)
      r.addColorStop(0, ink.ring)
      r.addColorStop(1, ink.glowEnd)
      x.fillStyle = r
      x.fillRect(0, 0, 64, 64)
    }
    this.glow = g
    return g
  }

  /** One draw: the air and the sea, the land with its borders, the dark rim, then the markers. Says whether a marker is still animating (the loop must go on). */
  private draw(now: number, reduced: boolean): boolean {
    const c = this.ctx
    if (!c || !this.w) return false
    const ink = this.colours(now)
    const R = this.radius()
    const cx = this.cx
    const cy = this.cy
    const shell = this.shading(c, ink, R)
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.clearRect(0, 0, this.w, this.h)
    c.beginPath()
    c.arc(cx, cy, R * 1.12, 0, Math.PI * 2)
    c.fillStyle = shell.air
    c.fill()
    c.beginPath()
    c.arc(cx, cy, R, 0, Math.PI * 2)
    c.fillStyle = shell.sea
    c.fill()
    const view = { cx, cy, r: R, lat: this.lat, lon: this.lon }
    c.lineWidth = 1
    c.strokeStyle = ink.grat
    strokeLines(c, grid, view)
    c.fillStyle = ink.land
    fillLand(c, view)
    c.strokeStyle = ink.coast
    c.lineWidth = 0.7
    strokeLines(c, borders, view)
    c.beginPath()
    c.arc(cx, cy, R, 0, Math.PI * 2)
    c.fillStyle = shell.rim
    c.fill()
    c.lineWidth = 1
    c.strokeStyle = ink.edge
    c.stroke()
    const sp = Math.sin(this.lat * RAD)
    const cp = Math.cos(this.lat * RAD)
    const glow = this.light(ink)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    let animating = false
    // A crowd draws its markers smaller, so they can sit close without hiding one another.
    const dense = this.density()
    for (let i = this.states.length - 1; i >= 0; i--) {
      const s = this.states[i]
      if (s.gone && now - s.gone > LEAVE_MS) {
        this.states[i] = this.states[this.states.length - 1]
        this.states.pop()
        continue
      }
      const p = s.lat * RAD
      const dl = (s.lon - this.lon) * RAD
      const cd = Math.cos(dl)
      const z = sp * Math.sin(p) + cp * Math.cos(p) * cd
      s.x = cx + R * Math.cos(p) * Math.sin(dl)
      s.y = cy - R * (cp * Math.sin(p) - sp * Math.cos(p) * cd)
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
      // The dot grows with the people at the spot (its number is on it).
      const r = (6 + Math.min(10, Math.sqrt(s.count) * 2.6)) * sc * dense
      const pulse = (now - s.pulse) / PULSE_MS
      if (!reduced && pulse < 1 && !s.gone) {
        c.globalAlpha = a * 0.6 * (1 - pulse)
        c.fillStyle = ink.ring
        c.beginPath()
        c.arc(s.x, s.y, r + pulse * 26 * dense, 0, Math.PI * 2)
        c.fill()
        animating = true
      }
      c.globalAlpha = a * 0.8
      c.drawImage(glow, s.x - r * 2.6, s.y - r * 2.6, r * 5.2, r * 5.2)
      c.globalAlpha = a
      c.beginPath()
      c.arc(s.x, s.y, r, 0, Math.PI * 2)
      c.fillStyle = ink.lime
      c.fill()
      c.lineWidth = 1.5
      c.strokeStyle = this.mark !== null && s.members.includes(this.mark) ? ink.bg : ink.card
      c.stroke()
      if (s.count > 1 && r >= 7) {
        c.fillStyle = ink.bg
        c.font = `700 ${Math.round(Math.min(13, r * 0.95))}px system-ui, sans-serif`
        c.fillText(s.label, s.x, s.y + 0.5)
      }
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
