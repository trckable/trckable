// What a replay does to the chart: nothing is redrawn, the frame and the axes stay where they are, and the line and its
// area are drawn on from the left by a clip that widens, with a dot riding the tip. The marks that carry `data-rv` (the
// x they sit at, in the chart's pixels) come in as the line reaches them. Every frame is written straight on the
// elements (found by their marks, so the chart passes no refs around); at the end everything is handed back, so the
// last frame is the still chart.
import { useEffect, useRef } from 'react'
import { reveal } from '../replay/reveal'

const CLIP_ID = 'chrev'

/** The clip the line is drawn through, and the dot at its tip. */
export function RevealTip({ h }: { h: number }) {
  return (
    <>
      <clipPath id={CLIP_ID}>
        <rect x="0" y="0" width="0" height={h} />
      </clipPath>
      <circle data-rv-tip="" r="4.5" fill="var(--mk-lime)" stroke="var(--mk-card)" strokeWidth="2" visibility="hidden" />
    </>
  )
}

/** The group the clip is put on. */
export const DRAWN = { 'data-rv-drawn': '' }

export function useReveal(geo: { pts: number[][]; h: number }) {
  const live = useRef(geo)
  useEffect(() => {
    live.current = geo
  })
  useEffect(() => {
    const frame = () => {
      const p = reveal.get()
      const root = document.querySelector<HTMLElement>('.chwrap')
      const g = root?.querySelector('[data-rv-drawn]')
      const tip = root?.querySelector('[data-rv-tip]')
      if (!root) return
      if (p < 0 || live.current.pts.length < 2) {
        g?.removeAttribute('clip-path')
        tip?.setAttribute('visibility', 'hidden')
        if (root.hasAttribute('data-reveal')) {
          root.removeAttribute('data-reveal')
          root.querySelectorAll('[data-in]').forEach((el) => el.removeAttribute('data-in'))
        }
        return
      }
      const { pts, h } = live.current
      const last = pts.length - 1
      const at = Math.min(last, p * last)
      const i = Math.min(last - 1, Math.floor(at))
      const f = at - i
      const x = pts[i][0] + f * (pts[i + 1][0] - pts[i][0])
      const y = pts[i][1] + f * (pts[i + 1][1] - pts[i][1])
      const rect = root.querySelector(`#${CLIP_ID} rect`)
      rect?.setAttribute('width', x.toFixed(2))
      rect?.setAttribute('height', String(h))
      g?.setAttribute('clip-path', `url(#${CLIP_ID})`)
      tip?.setAttribute('cx', x.toFixed(2))
      tip?.setAttribute('cy', y.toFixed(2))
      tip?.setAttribute('visibility', 'visible')
      root.setAttribute('data-reveal', '')
      root.querySelectorAll('[data-rv]:not([data-in])').forEach((el) => {
        if (Number(el.getAttribute('data-rv')) <= x) el.setAttribute('data-in', '')
      })
    }
    frame()
    return reveal.subscribe(frame)
  }, [])
}
