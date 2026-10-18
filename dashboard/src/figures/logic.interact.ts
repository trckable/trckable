// A lever on the logic board flips (it lights while it is up), and a click on
// the board starts the four checks over. Nothing here under less motion.
export function attachLogic(svg: SVGSVGElement): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  const click = (e: Event) => {
    const t = e.target as Element
    t.closest('.lever')?.classList.toggle('lit')
    // restarting the sequence: take the animations off for a frame
    svg.classList.add('tk-restart')
    void svg.getBoundingClientRect()
    requestAnimationFrame(() => svg.classList.remove('tk-restart'))
  }
  svg.addEventListener('click', click)
  return () => svg.removeEventListener('click', click)
}
