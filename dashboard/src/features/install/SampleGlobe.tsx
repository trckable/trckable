// The real Live globe (the engine of v2/live/globe) with a handful of sample pins, for the setup screen's sample. It only
// draws: no picking, no popover, no keys, no zoom. Loaded on its own, so the engine and the map stay out of the first paint.
import { useEffect, useRef } from 'react'
import { Globe } from '../../v2/live/globe/engine'
import type { Pin } from '../../v2/live/globe/geo'

const NOOP = () => {}
const SPOTS: [string, string, number, number, number][] = [
  ['US', 'New York', 40.71, -74.01, 6],
  ['US', 'San Francisco', 37.77, -122.42, 3],
  ['DE', 'Berlin', 52.52, 13.4, 3],
  ['GB', 'London', 51.51, -0.13, 2],
  ['BR', 'São Paulo', -23.55, -46.63, 2],
  ['IN', 'Bengaluru', 12.97, 77.59, 1],
]
const pins = (): Pin[] =>
  SPOTS.flatMap(([cc, city, lat, lon, n]) =>
    Array.from({ length: n }, (_, i) => ({ key: `${city}-${i}`, cc, city, path: '/', lat, lon, last: Date.now(), sig: `${city}-${i}`, crowd: n })),
  )

export default function SampleGlobe() {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = box.current
    const cv = canvas.current
    if (!el || !cv) return
    const g = new Globe(cv, { onPick: NOOP, onCrowd: NOOP, onHover: NOOP, onSheet: NOOP })
    g.setPins(pins())
    const size = new ResizeObserver(([e]) => g.resize(e.contentRect.width, e.contentRect.height))
    size.observe(el)
    const seen = new IntersectionObserver(([e]) => g.setOnScreen(e.isIntersecting))
    seen.observe(el)
    return () => {
      size.disconnect()
      seen.disconnect()
      g.destroy()
    }
  }, [])
  return (
    <div className="sp-globe" ref={box}>
      <canvas ref={canvas} />
    </div>
  )
}
