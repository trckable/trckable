// The replay over the chart: a time marker that sweeps the plot, a count that climbs with the line, and the moments of
// the period told one at a time (a dot on the line, the words in the caption strip of the cinema's foot). Nothing here is in the chart's flow: the layer sits over it (absolute), and a frame only
// writes on elements that are already there. The line itself is drawn by the shared clock (reveal.ts, RevealClip.tsx);
// this only reads it. The caption strip, the progress and the buttons are ReplayBar's, under the chart.
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Bucket, ReportQuery } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { bucketLabel } from '../../charts/timeScale'
import { clockOf, countAt, pickCaps, type Cap } from '../replay/story'
import { copy } from '../replay/story.copy'
import type { Replay } from '../replay/useReplay'
import { useStoryCaps } from '../replay/useStoryCaps'
import { reveal } from '../replay/reveal'
import './replay.css'

export interface ReplayIn {
  replay: Replay
  site: string
  query: ReportQuery
  bucket: Bucket
  /** The points the line is drawn through: their names and people. */
  labels: string[]
  vals: number[]
  total: number
  /** The moments the page already holds (the numbers' own, and today's from the day's record). */
  base: Cap[]
  today: boolean
  /** Minutes of today that have passed, and the clock they make. */
  end: number
  clock: string
  /** The period's name, and its top channel. */
  period: string
  source?: string
  money?: (minor: number) => string
  onShare: () => void
}

/** A moment's dot stays this long at full size before it settles. */
const SETTLE_MS = 1000

export function ReplayStage({ r, children }: { r: ReplayIn; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const read = useStoryCaps({ on: !r.today, site: r.site, query: r.query, bucket: r.bucket, labels: r.labels, money: r.money })
  const caps = useMemo(() => pickCaps([...r.base, ...read.caps]), [r.base, read.caps])
  const { phase, ready } = r.replay
  useEffect(() => {
    if (phase === 'on' && read.loaded) ready(caps.map((c) => c.pos))
    // The run takes the moments as they are when it begins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, read.loaded, ready])
  const live = useRef({ ...r, caps })
  useEffect(() => {
    live.current = { ...r, caps }
  })
  useEffect(() => {
    if (phase !== 'on') return
    const el = root.current
    if (!el) return
    const q = (s: string) => el.querySelector<HTMLElement>(s)
    // The foot (caption, progress, time) is the stage's neighbour, in the same block.
    const foot = (s: string) => el.closest('.chwrap')?.querySelector<HTMLElement>(s) ?? null
    const sub = foot('[data-rp-sub]')
    const prog = foot('[data-rp-prog]')
    const time = foot('[data-rp-time]')
    const cards = [...el.querySelectorAll<HTMLElement>('[data-cap]')]
    const num = q('[data-rp-n]')
    const tag = q('[data-rp-t]')
    const mark = q('[data-rp-mark]')
    const pin = q('[data-rp-pin]')
    const seen = new Set<number>()
    let timer = 0
    let last = -1
    const settle = (k: number) => {
      if (cards[k]?.getAttribute('data-s') === 'show') cards[k].setAttribute('data-s', 'settled')
      // The chart's own label over its rise comes back when no caption is pinned.
      if (k === last) el.removeAttribute('data-pinned')
    }
    for (const c of cards) c.setAttribute('data-s', '')
    const frame = () => {
      const p = reveal.get()
      if (p < 0) return
      const { vals, total, labels, bucket, today, end, caps: cs } = live.current
      const tip = el.querySelector('[data-rv-tip]')
      const x = Number(tip?.getAttribute('cx') ?? 0)
      const y = Number(tip?.getAttribute('cy') ?? 0)
      el.setAttribute('data-run', '')
      mark?.style.setProperty('transform', `translate3d(${x.toFixed(1)}px,0,0)`)
      const stamp = today ? clockOf(p * end) : bucketLabel(labels[Math.round(p * (labels.length - 1))] ?? '', bucket)
      if (tag && tag.textContent !== stamp) tag.textContent = stamp
      if (time && time.textContent !== stamp) time.textContent = stamp
      prog?.style.setProperty('transform', `scaleX(${p.toFixed(4)})`)
      const n = fmtInt(countAt(vals, total, p))
      if (num && num.textContent !== n) num.textContent = n
      pin?.style.setProperty('transform', `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`)
      cs.forEach((c, k) => {
        if (seen.has(k) || c.pos > p + 1e-6) return
        seen.add(k)
        if (last >= 0) settle(last)
        last = k
        const card = cards[k]
        if (card) {
          card.style.setProperty('--x', `${x.toFixed(1)}px`)
          card.style.setProperty('--y', `${y.toFixed(1)}px`)
          card.setAttribute('data-s', 'show')
          el.setAttribute('data-pinned', '')
        }
        if (sub) sub.textContent = [c.at, c.line, c.sub].filter(Boolean).join(' · ')
        clearTimeout(timer)
        timer = window.setTimeout(() => settle(k), SETTLE_MS)
      })
    }
    frame()
    const off = reveal.subscribe(frame)
    return () => {
      off()
      clearTimeout(timer)
      el.removeAttribute('data-run')
      el.removeAttribute('data-pinned')
      cards.forEach((_, k) => settle(k))
    }
  }, [phase])
  return (
    <div className="rp-stage" ref={root} data-phase={phase}>
      {children}
      <div className="rp-over" aria-hidden={phase !== 'end'}>
        <div className="rp-mark" data-rp-mark>
          <span className="rp-tag" data-rp-t />
        </div>
        <div className="rp-hud">
          <span className="rp-n">
            <b data-rp-n />
            {/* The real total is laid under the count (invisible), so the box is as wide as it will get and never grows. */}
            <i className="rp-gh">{fmtInt(r.total)}</i>
          </span>
          <span className="rp-u">{copy.peopleWord(r.total)}</span>
        </div>
        <div className="rp-pin" data-rp-pin />
        {caps.map((c) => (
          <div key={`${c.pos}${c.kind}`} className={`rp-cap ${c.kind}`} data-cap data-s="">
            <i className="rp-dot" />
          </div>
        ))}
      </div>
    </div>
  )
}
