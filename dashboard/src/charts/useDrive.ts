// While Replay plays, its playhead (a position between two points) moves the
// cut and the marker every frame, straight on the elements: a transform, no
// render, no glide restarting at each point. Returns the marker's ref, and
// whether the playhead is driving.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { playhead } from '../features/overview/playhead'
import { reducedMotion } from '../lib/motion'
import { pointOn } from './smooth'

interface DriveArgs {
  ref: RefObject<HTMLDivElement | null>
  locked?: boolean
  vals: number[]
  x: (i: number) => number
  y: (v: number) => number
}

export function useDrive({ ref, locked, vals, x, y }: DriveArgs): [RefObject<SVGCircleElement | null>, boolean] {
  // With reduced motion the cut steps from moment to moment instead.
  const driven = !!locked && !reducedMotion()
  const marker = useRef<SVGCircleElement>(null)
  const frame = useRef<(pos: number) => void>(() => {})
  useLayoutEffect(() => {
    frame.current = (pos) => {
      if (pos < 0 || !ref.current) return
      const [px, py] = pointOn(vals.map((v, i) => [x(i), y(v)]), pos)
      // On the grey and the crosshair themselves: a variable set on the
      // wrapper would restyle everything under it, every frame.
      for (const el of ref.current.querySelectorAll<SVGElement>('.chart-dim, .chart-cut')) el.style.transform = `translateX(${px.toFixed(2)}px)`
      marker.current?.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)})`)
    }
  })
  useEffect(() => {
    if (!driven) return
    const run = () => frame.current(playhead.get())
    run()
    const off = playhead.subscribe(run)
    const wrap = ref.current
    return () => {
      off()
      wrap?.querySelectorAll<SVGElement>('.chart-dim, .chart-cut').forEach((el) => (el.style.transform = ''))
    }
  }, [driven, ref])
  return [marker, driven]
}
