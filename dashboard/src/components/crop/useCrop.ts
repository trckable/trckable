// The cropper's state: where the picture sits and how large it is, moved by
// pointer (mouse, pen, one finger; two fingers pinch), wheel and keyboard.
import { useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { clamp, clampZoom, nudge, rezoom, sized, zoomRange, type Point } from './math'

const ORIGIN: Point = { x: 0, y: 0 }

export function useCrop(img: HTMLImageElement | null, startCover: boolean) {
  const iw = img?.naturalWidth || 1
  const ih = img?.naturalHeight || 1
  const range = zoomRange(iw, ih)
  const [zoom, setZoomRaw] = useState<number | null>(null)
  const z = zoom ?? (startCover ? range.cover : 1)
  const [at, setAt] = useState<Point>(ORIGIN)
  const [centred, setCentred] = useState(0) // bumps on each re-centre, for the announcement
  const [gliding, setGliding] = useState(false) // eases back to the centre, unless motion is reduced
  const { w, h } = sized(iw, ih, z)
  const pointers = useRef(new Map<number, Point>())
  const drag = useRef<{ start: Point; from: Point; span: number; zoom: number } | null>(null)

  const place = (p: Point, zz = z) => {
    const s = sized(iw, ih, zz)
    setGliding(false)
    setAt(clamp(p, s.w, s.h))
  }
  const setZoom = (next: number) => {
    const to = clampZoom(next, range.max)
    setZoomRaw(to)
    place(rezoom(at, z, to), to)
  }
  const center = () => {
    setAt(ORIGIN)
    setGliding(true)
    setCentred((n) => n + 1)
  }

  const spread = () => {
    const [a, b] = [...pointers.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }
  const begin = () => {
    const [first] = [...pointers.current.values()]
    drag.current = first ? { start: first, from: at, span: spread(), zoom: z } : null
  }

  const stage = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId)
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      begin()
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!pointers.current.has(e.pointerId)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const d = drag.current
      if (!d) return
      if (d.span > 0 && pointers.current.size > 1) {
        setZoom((d.zoom * spread()) / d.span)
        return
      }
      place({ x: d.from.x + e.clientX - d.start.x, y: d.from.y + e.clientY - d.start.y })
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      pointers.current.delete(e.pointerId)
      begin()
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => {
      pointers.current.delete(e.pointerId)
      begin()
    },
    onDoubleClick: center,
    onWheel: (e: WheelEvent<HTMLElement>) => setZoom(z * Math.exp(-e.deltaY / 500)),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const move = nudge(e.key, e.shiftKey)
      const zooms: Record<string, number> = { '+': 1.1, '=': 1.1, '-': 1 / 1.1, _: 1 / 1.1 }
      if (move) place({ x: at.x + move.x, y: at.y + move.y })
      else if (zooms[e.key]) setZoom(z * zooms[e.key])
      else if (e.key === 'Home' || e.key === '0') center()
      else return
      e.preventDefault()
    },
  }

  return { zoom: z, range, at, w, h, centred, gliding, setZoom, center, stage }
}
