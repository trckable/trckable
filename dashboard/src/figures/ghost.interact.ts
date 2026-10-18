// The ghost follows the pointer (or a finger) with its lamp's beam and its eyes,
// and goes back to the sweep on its own when nothing has moved for a while.
// Plain code with no imports, so it also runs outside the dashboard bundle.
// With less motion asked for, nothing follows.
const C = Math.cos(Math.PI / 6)
const S = 0.5
const CARD_TOP = 13.5 // z of the cards' top, where the light lands
const IDLE_MS = 2600

export function attachGhost(svg: SVGSVGElement): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  const num = (name: string) => (svg.dataset[name] ?? '').split(' ').map(Number)
  const [lx = 0, ly = 0] = num('lamp')
  const [ox = 0, oy = 0] = num('orig')
  const [sx0 = 0, sy0 = 0] = num('spot0')
  const [ex = 0, ey = 0] = num('eye')
  const base = Number(svg.dataset.base)
  const cone = svg.querySelector<SVGElement>('.tk-cone')
  const spot = svg.querySelector<SVGElement>('.tk-spotg')
  const eyes = svg.querySelector<SVGElement>('.tk-eyes')
  if (!cone || !spot || !eyes) return () => {}
  let idle = 0

  const point = (e: PointerEvent) => {
    const m = svg.getScreenCTM()
    if (!m) return null
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
  }
  const follow = (e: PointerEvent) => {
    const p = point(e)
    if (!p) return
    svg.classList.add('tk-follow')
    // the pointer, on the desk's plane at the cards' height
    const u = (p.x - ox) / C
    const v = (p.y - oy + CARD_TOP) / S
    const x = Math.min(282, Math.max(8, (u + v) / 2))
    const y = Math.min(197, Math.max(8, (v - u) / 2))
    const tx = (x - y) * C + ox
    const ty = (x + y) * S - CARD_TOP + oy
    const deg = (Math.atan2(ty - ly, tx - lx) * 180) / Math.PI - base
    cone.style.transform = `rotate(${deg}deg)`
    spot.style.transform = `translate(${x - sx0}px, ${y - sy0}px)`
    const dx = p.x - ex
    const dy = p.y - ey
    const d = Math.hypot(dx, dy) || 1
    const k = Math.min(1, d / 140)
    eyes.style.setProperty('--ex', `${((dx / d) * 2.6 * k).toFixed(2)}px`)
    eyes.style.setProperty('--ey', `${((dy / d) * 2 * k).toFixed(2)}px`)
    clearTimeout(idle)
    idle = window.setTimeout(release, IDLE_MS)
  }
  const release = () => {
    svg.classList.remove('tk-follow')
    cone.style.transform = ''
    spot.style.transform = ''
    eyes.style.removeProperty('--ex')
    eyes.style.removeProperty('--ey')
  }
  const leave = (e: PointerEvent) => {
    clearTimeout(idle)
    idle = window.setTimeout(release, e.pointerType === 'mouse' ? 700 : IDLE_MS)
  }
  svg.addEventListener('pointermove', follow)
  svg.addEventListener('pointerdown', follow)
  svg.addEventListener('pointerleave', leave)
  return () => {
    clearTimeout(idle)
    svg.removeEventListener('pointermove', follow)
    svg.removeEventListener('pointerdown', follow)
    svg.removeEventListener('pointerleave', leave)
  }
}
