// Clicking the red LED makes it blink fast for a few seconds; a unit's button
// lights while it is pressed. Nothing here under less motion.
export function attachRack(svg: SVGSVGElement): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  const led = svg.querySelector<SVGGraphicsElement>('.rack-led.down')
  let timer = 0
  let hit: SVGCircleElement | null = null
  if (led?.parentNode) {
    // a roomier target than the LED itself
    const b = led.getBBox()
    hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    hit.setAttribute('class', 'tk-hit')
    hit.setAttribute('cx', String(b.x + b.width / 2))
    hit.setAttribute('cy', String(b.y + b.height / 2))
    hit.setAttribute('r', '9')
    led.parentNode.appendChild(hit)
  }
  const blink = () => {
    svg.classList.add('tk-blinking')
    clearTimeout(timer)
    timer = window.setTimeout(() => svg.classList.remove('tk-blinking'), 3200)
  }
  const click = (e: Event) => {
    const t = e.target as Element
    if (t === hit || t === led) blink()
    const btn = t.closest('.rack-btn')
    if (btn) {
      btn.classList.add('lit')
      setTimeout(() => btn.classList.remove('lit'), 450)
    }
  }
  svg.addEventListener('click', click)
  return () => {
    clearTimeout(timer)
    svg.removeEventListener('click', click)
    hit?.remove()
  }
}
