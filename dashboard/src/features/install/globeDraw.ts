// The globe behind the setup screen: a dotted sphere rising from the bottom of the page, lime arcs flying in from cities to
// one spot and landing there with a soft ping ("visits arriving"), a slow sway, a soft hole keeping dots off the page's text.
// It runs only while it is on screen and the tab is visible; with reduced motion it draws one still frame. Colours come from the
// page's own tokens (--accent, --text-2, --bg), read when it starts and again when the theme changes.
import { CITY, LAND } from './setupGlobeLand'

type V3 = [number, number, number]
type Arc = { o: V3; t0: number; d: number; done?: boolean }
type Ping = { t0: number }
type Pose = [number, number, number, number]

const D = Math.PI / 180
const TAU = Math.PI * 2
/** Where the arcs land: a generic spot in the middle of a continent, not a place of ours. */
const HUB: [number, number] = [39, -98]
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const unit = (la: number, lo: number): V3 => [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]

const land: number[] = []
const sea: number[] = []
LAND.split(',').forEach((row, i) => {
  const la = (-36 + i) * D
  const n = Math.max(1, Math.round(360 * Math.cos(la)))
  let k = 0
  let on = 0
  for (const ch of row) {
    const r = parseInt(ch, 36)
    if (on) for (let j = 0; j < r; j++) land.push(...unit(la, ((k + j + 0.5) / n) * TAU - Math.PI))
    k += r
    on ^= 1
  }
})
// A faint grid over the sea keeps the sphere's body between the continents.
for (let la = -36; la < 90; la += 3) {
  const n = Math.max(1, Math.round(120 * Math.cos(la * D)))
  for (let k = 0; k < n; k++) sea.push(...unit(la * D, (k / n) * TAU))
}
const cities: V3[] = []
for (let i = 0; i < CITY.length; i += 2) cities.push(unit(CITY[i] * D, CITY[i + 1] * D))
const hub = unit(HUB[0] * D, HUB[1] * D)

/** Globe space to view space: yaw about the vertical axis, then a tilt towards the viewer. */
const view = (v: V3, [c, s, ct, st]: Pose): V3 => {
  const x = v[0] * c + v[2] * s
  const z = v[2] * c - v[0] * s
  return [x, v[1] * ct - z * st, v[1] * st + z * ct]
}
const slerp = (a: V3, b: V3, f: number): [number, number, number, number] => {
  const O = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const s = Math.sin(O) || 1
  const p = Math.sin((1 - f) * O) / s
  const q = Math.sin(f * O) / s
  return [a[0] * p + b[0] * q, a[1] * p + b[1] * q, a[2] * p + b[2] * q, O]
}

/** Starts the globe on a host element holding the canvas; returns what stops it. */
export function startGlobe(host: HTMLElement, cv: HTMLCanvasElement, avoid: string): () => void {
  const g = cv.getContext('2d')
  if (!g) return () => {}
  const ctx = g
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  let W = 0
  let H = 0
  let cx = 0
  let cy = 0
  let R = 0
  let phone = false
  let yaw0 = 0
  let tilt0 = 0
  let arcs: Arc[] = []
  let pings: Ping[] = []
  let next = 0
  let on = false
  let seen = false
  let col = { text: '', accent: '', bg: '', light: false }
  const t0 = performance.now()

  const colors = () => {
    const cs = getComputedStyle(document.documentElement)
    col = { text: cs.getPropertyValue('--text-2').trim(), accent: cs.getPropertyValue('--accent').trim(), bg: cs.getPropertyValue('--bg').trim(), light: document.documentElement.dataset.theme === 'light' }
  }
  // A soft hole where the page's text and boxes are, and a vignette so the canvas has no hard edge.
  const mask = () => {
    const hr = host.getBoundingClientRect()
    const rs = [...document.querySelectorAll(avoid)].map((e) => e.getBoundingClientRect())
    const k = 8
    const w = Math.ceil(W / k)
    const h = Math.ceil(H / k)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')
    if (!x) return
    const im = x.createImageData(w, h)
    const pad = 12
    const fall = phone ? 30 : 70
    const side = Math.max(24, W * 0.06)
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const px = (i + 0.5) * k
        const py = (j + 0.5) * k
        let d = 1e9
        for (const r of rs) d = Math.min(d, Math.hypot(Math.max(r.left - hr.left - px, 0, px - (r.right - hr.left)), Math.max(r.top - hr.top - py, 0, py - (r.bottom - hr.top))))
        const u = Math.min(1, Math.max(0, (d - pad) / fall))
        const e = Math.max(0, Math.min(1, py / 140, px / side, (W - px) / side))
        im.data[(j * w + i) * 4 + 3] = Math.round(255 * (0.3 + 0.7 * u * u * (3 - 2 * u)) * e)
      }
    x.putImageData(im, 0, 0)
    cv.style.maskSize = '100% 100%'
    cv.style.maskImage = `url(${c.toDataURL()})`
  }
  const build = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    W = host.clientWidth
    H = host.clientHeight
    phone = W < 700
    cv.width = Math.round(W * dpr)
    cv.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // The sphere rises from the bottom edge; the landing spot sits up on its curve, off to one side of the column.
    R = phone ? W * 1.25 : Math.min(Math.max(W * 0.8, 600), 1100)
    cx = W / 2
    cy = H + R * 0.3
    tilt0 = HUB[0] * D - 55 * D
    yaw0 = -HUB[1] * D + (phone ? 0.25 : 0.5)
    arcs = []
    pings = []
    next = 0
    mask()
  }
  const pose = (t: number): Pose => {
    const yaw = yaw0 + 0.2 * Math.sin(t / 9500)
    return [Math.cos(yaw), Math.sin(yaw), Math.cos(tilt0), Math.sin(tilt0)]
  }
  const update = (t: number) => {
    const p = pose(t)
    if (t > next) {
      next = t + (phone ? rnd(900, 1500) : rnd(450, 900))
      const h = view(hub, p)
      const ok: V3[] = []
      for (const c of cities) {
        const v = view(c, p)
        if (v[2] > 0.12 && Math.hypot(v[0] - h[0], v[1] - h[1]) > 0.3) ok.push(c)
      }
      const from = ok[Math.floor(Math.random() * ok.length)]
      if (h[2] > 0.1 && from && arcs.length < (phone ? 4 : 7)) arcs.push({ o: from, t0: t, d: phone ? rnd(2600, 3600) : rnd(1700, 2500) })
    }
    for (let k = arcs.length - 1; k >= 0; k--) {
      const a = arcs[k]
      if (t - a.t0 > a.d && !a.done) {
        a.done = true
        pings.push({ t0: t })
      }
      if (t - a.t0 > a.d + 900) arcs.splice(k, 1)
    }
    pings = pings.filter((p2) => t - p2.t0 <= 1600)
  }
  const draw = (t: number) => {
    ctx.clearRect(0, 0, W, H)
    const p = pose(t)
    const [c, s, ct, st] = p
    const lt = col.light
    const soft = phone ? 0.75 : 1
    // The rim glow: a few thin rings fading outward.
    ctx.strokeStyle = col.accent
    for (let i = 0; i < 24; i++) {
      ctx.globalAlpha = (lt ? 0.1 : 0.07) * (1 - i / 24) ** 2
      ctx.lineWidth = R * 0.004
      ctx.beginPath()
      ctx.arc(cx, cy, R * (1.002 + i * 0.0035), 0, TAU)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = col.bg
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, TAU)
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, TAU)
    ctx.stroke()
    // Dots in five brightness steps, brighter towards the limb so the horizon glows; the sea in a sixth.
    const B = [0, 1, 2, 3, 4, 5].map(() => new Path2D())
    const r0 = phone ? 1.05 : Math.max(0.85, R * 0.0015)
    for (const [A, isSea] of [[land, false], [sea, true]] as const)
      for (let i = 0; i < A.length; i += 3) {
        const x = A[i] * c + A[i + 2] * s
        const z0 = A[i + 2] * c - A[i] * s
        const y = A[i + 1] * ct - z0 * st
        const z = A[i + 1] * st + z0 * ct
        if (!(z >= 0.02)) continue
        const X = cx + x * R
        const Y = cy - y * R
        if (Y > H + 4 || Y < -4) continue
        const r = isSea ? r0 * 0.7 : r0
        const path = B[isSea ? 5 : Math.max(0, Math.min(4, Math.floor((1 - z) * 5.4)))]
        path.moveTo(X + r, Y)
        path.arc(X, Y, r, 0, TAU)
      }
    const a0 = lt ? [0.24, 0.34, 0.46, 0.6, 0.76] : [0.22, 0.3, 0.42, 0.56, 0.74]
    ctx.fillStyle = lt ? col.accent : col.text
    B.forEach((path, k) => {
      ctx.globalAlpha = k < 5 ? a0[k] : (lt ? 0.3 : 0.2) * (phone ? 1.3 : 1)
      ctx.fill(path)
    })
    ctx.fillStyle = ctx.strokeStyle = col.accent
    ctx.lineCap = 'round'
    const at = (v: V3, lift: number): [number, number] => [cx + v[0] * lift * R, cy - v[1] * lift * R]
    const lift = (q: number[], f: number) => 1 + 0.32 * Math.sin(f * Math.PI) * Math.min(1, q[3] / 1.2)
    const h = view(hub, p)
    if (h[2] > 0.02) {
      const q = at(h, 1)
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(q[0], q[1], 3.2, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t / 700)
      ctx.beginPath()
      ctx.arc(q[0], q[1], 8, 0, TAU)
      ctx.stroke()
      for (const ping of pings) {
        const k = (t - ping.t0) / 1600
        const r = 6 + k * 54
        ctx.globalAlpha = (1 - k) * (lt ? 0.8 : 0.7) * soft
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.ellipse(q[0], q[1], r, r * h[2] * 0.9 + 1, Math.atan2(-h[1], h[0]) + Math.PI / 2, 0, TAU)
        ctx.stroke()
      }
    }
    // Arcs lifted off the surface: a bright head with a tail, and the whole route drawn faint.
    for (const a of arcs) {
      const o = view(a.o, p)
      const k = Math.min(1, (t - a.t0) / a.d)
      const gone = t - a.t0 > a.d ? 1 - (t - a.t0 - a.d) / 900 : 1
      const N = 22
      const f0 = Math.max(0, k - 0.42)
      let prev: [number, number] | null = null
      for (let j = 0; j <= N; j++) {
        const f = f0 + (k - f0) * (j / N)
        const q = slerp(o, h, f)
        const L = lift(q, f)
        const pt = at([q[0], q[1], q[2]], L)
        if (prev && q[2] * L > -0.1) {
          ctx.globalAlpha = (j / N) * 0.95 * gone * soft
          ctx.lineWidth = 1.2 + (j / N) * 1.6
          ctx.beginPath()
          ctx.moveTo(prev[0], prev[1])
          ctx.lineTo(pt[0], pt[1])
          ctx.stroke()
        }
        prev = pt
      }
      if (prev && gone === 1) {
        ctx.globalAlpha = soft
        ctx.beginPath()
        ctx.arc(prev[0], prev[1], 2.4, 0, TAU)
        ctx.fill()
      }
      ctx.globalAlpha = 0.2 * gone * soft
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let j = 0; j <= 30; j++) {
        const q = slerp(o, h, j / 30)
        const pt = at([q[0], q[1], q[2]], lift(q, j / 30))
        if (j) ctx.lineTo(pt[0], pt[1])
        else ctx.moveTo(pt[0], pt[1])
      }
      ctx.stroke()
      const kk = Math.min(1, (t - a.t0) / 700)
      if (kk < 1) {
        const op = at(o, 1)
        ctx.globalAlpha = (1 - kk) * 0.8 * soft
        ctx.beginPath()
        ctx.arc(op[0], op[1], 2 + kk * 14, 0, TAU)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }
  const still1 = () => {
    for (let t = 0; t <= 4200; t += 100) update(t)
    draw(4200)
  }
  const paint = () => (still ? still1() : draw(performance.now() - t0))
  const frame = (now: number) => {
    if (!on) return
    update(now - t0)
    draw(now - t0)
    requestAnimationFrame(frame)
  }
  const go = () => {
    const want = seen && !document.hidden
    if (want && !on) {
      on = true
      requestAnimationFrame(frame)
    } else if (!want) on = false
  }
  colors()
  build()
  paint()
  const size = new ResizeObserver(() => {
    if (host.clientWidth === W && host.clientHeight === H) return
    build()
    paint()
  })
  size.observe(host)
  const theme = new MutationObserver(() => {
    colors()
    if (!on) paint()
  })
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  // The page's words move when the column is laid out after the first paint: measure the hole again once it has settled.
  const settle = setTimeout(() => {
    mask()
  }, 600)
  const look = new IntersectionObserver(([e]) => {
    seen = e.isIntersecting
    go()
  })
  if (!still) look.observe(host)
  document.addEventListener('visibilitychange', go)
  return () => {
    on = false
    clearTimeout(settle)
    size.disconnect()
    theme.disconnect()
    look.disconnect()
    document.removeEventListener('visibilitychange', go)
  }
}
