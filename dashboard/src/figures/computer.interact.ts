// A key on the desk computer types a little of the script tag; the last one
// brings the check. Hovering the figure and typing on a real keyboard works too.
// Idle for a while, it goes back to typing by itself. Nothing here under less motion.
const STEPS = 26
const WIDTH = 80
const IDLE_MS = 3600

export function attachComputer(svg: SVGSVGElement): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  const cover = svg.querySelector<SVGElement>('.tk-cover')
  const done = svg.querySelectorAll<SVGElement>('.tk-check, .tk-ok')
  const tick = svg.querySelector<SVGElement>('.tk-tick')
  if (!cover) return () => {}
  let typed = 0
  let idle = 0
  let over = false

  const show = () => {
    svg.classList.add('tk-manual')
    cover.style.transform = `translateX(${(WIDTH * typed) / STEPS}px)`
    const finished = typed >= STEPS
    done.forEach((el) => (el.style.opacity = finished ? '1' : '0'))
    if (tick) tick.style.strokeDashoffset = finished ? '0' : '20'
  }
  const reset = () => {
    typed = 0
    svg.classList.remove('tk-manual')
    cover.style.transform = ''
    done.forEach((el) => el.style.removeProperty('opacity'))
    tick?.style.removeProperty('stroke-dashoffset')
  }
  const press = (n = 3) => {
    typed = typed >= STEPS ? n : Math.min(STEPS, typed + n)
    show()
    clearTimeout(idle)
    idle = window.setTimeout(reset, IDLE_MS)
  }
  const click = (e: Event) => {
    if ((e.target as Element).closest('.key')) press()
  }
  const enter = () => (over = true)
  const leave = () => (over = false)
  const keydown = (e: KeyboardEvent) => {
    if (over && e.key.length === 1) press(2)
  }
  svg.addEventListener('click', click)
  svg.addEventListener('pointerenter', enter)
  svg.addEventListener('pointerleave', leave)
  addEventListener('keydown', keydown)
  return () => {
    clearTimeout(idle)
    svg.removeEventListener('click', click)
    svg.removeEventListener('pointerenter', enter)
    svg.removeEventListener('pointerleave', leave)
    removeEventListener('keydown', keydown)
  }
}
