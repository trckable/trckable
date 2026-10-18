// The replay lab over the chart: a time marker that sweeps the plot, a count that climbs with the line, and the moments
// of the period told one at a time. Nothing here is in the chart's flow: the layer sits over it (absolute), the row
// under it has its height from the start, and a frame only writes on elements that are already there. The line itself is
// drawn by the shared clock (reveal.ts, RevealClip.tsx); this only reads it.
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Bucket, ReportQuery } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { sourceName } from '../briefing/model'
import { bucketLabel } from '../../charts/timeScale'
import { best } from '../../features/story/moments'
import { clockOf, countAt, MAX_STORY, pickCaps, type Cap, type LabMode } from '../replay/lab'
import { copy } from '../replay/lab.copy'
import type { Lab } from '../replay/useLab'
import { useLabCaps } from '../replay/useLabCaps'
import { reveal } from '../replay/reveal'
import { LabFoot } from './LabFoot'
import './lab.css'

export interface LabIn {
  mode: LabMode
  lab: Lab
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

const SETTLE_MS = 1000

/** A caption near either edge opens inwards, so it never leaves the card. */
function leanOf(f: number): 'l' | 'r' | 'c' {
  if (f < 0.22) return 'l'
  return f > 0.78 ? 'r' : 'c'
}

export function LabStage({ l, children }: { l: LabIn; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const { lab } = l
  const read = useLabCaps({ on: !l.today, site: l.site, query: l.query, bucket: l.bucket, labels: l.labels, money: l.money })
  const caps = useMemo(() => pickCaps([...l.base, ...read.caps], l.mode === 'story' ? MAX_STORY : undefined), [l.base, read.caps, l.mode])
  const { phase, ready } = lab
  useEffect(() => {
    if (phase === 'on' && read.loaded) ready(l.mode === 'story' ? caps.map((c) => c.pos) : null)
    // The run takes the moments as they are when it begins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, read.loaded, ready])
  const live = useRef({ ...l, caps })
  useEffect(() => {
    live.current = { ...l, caps }
  })
  useEffect(() => {
    if (phase !== 'on') return
    const el = root.current
    if (!el) return
    const q = (s: string) => el.parentElement?.querySelector<HTMLElement>(s) ?? null
    const all = (s: string) => [...(el.parentElement?.querySelectorAll<HTMLElement>(s) ?? [])]
    const cards = all('[data-cap]')
    const chips = all('[data-chip]')
    const num = q('[data-lab-n]')
    const times = all('[data-lab-t],[data-lab-c]')
    const mark = q('[data-lab-mark]')
    const pin = q('[data-lab-pin]')
    const seen = new Set<number>()
    let timer = 0
    let last = -1
    const settle = (k: number) => {
      for (const e of [cards[k], chips[k]]) if (e?.getAttribute('data-s') === 'show') e.setAttribute('data-s', 'settled')
    }
    for (const e of [...cards, ...chips]) e.setAttribute('data-s', '')
    const frame = () => {
      const p = reveal.get()
      if (p < 0) return
      const { vals, total, labels, bucket, today, end, caps: cs } = live.current
      const tip = el.querySelector('[data-rv-tip]') ?? el.parentElement?.querySelector('[data-rv-tip]')
      const x = Number(tip?.getAttribute('cx') ?? 0)
      const y = Number(tip?.getAttribute('cy') ?? 0)
      el.setAttribute('data-run', '')
      mark?.style.setProperty('transform', `translate3d(${x.toFixed(1)}px,0,0)`)
      const stamp = today ? clockOf(p * end) : bucketLabel(labels[Math.round(p * (labels.length - 1))] ?? '', bucket)
      times.forEach((t) => t.textContent !== stamp && (t.textContent = stamp))
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
          const w = el.clientWidth || 1
          card.style.setProperty('--x', `${x.toFixed(1)}px`)
          card.style.setProperty('--y', `${y.toFixed(1)}px`)
          card.setAttribute('data-lean', leanOf(x / w))
          card.setAttribute('data-below', y < 70 ? '1' : '0')
          card.setAttribute('data-s', 'show')
        }
        const chip = chips[k]
        chip?.setAttribute('data-s', 'show')
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
      cards.forEach((_, k) => settle(k))
    }
  }, [phase])
  const final = fmtInt(l.total)
  return (
    <>
      <div className={`lab-stage lab-m-${l.mode}`} ref={root} data-phase={phase}>
        {children}
        <div className="lab-over" aria-hidden={phase !== 'end'}>
          <div className="lab-mark" data-lab-mark>
            <span className="lab-tag" data-lab-t />
          </div>
          <div className="lab-hud">
            {l.mode === 'clock' && <span className="lab-clock" data-lab-c />}
            <span className="lab-n">
              <b data-lab-n />
              <i className="lab-gh">{final}</i>
            </span>
            <span className="lab-u">{copy.peopleWord(l.total)}</span>
          </div>
          <div className="lab-pin" data-lab-pin />
          {l.mode === 'story' &&
            caps.map((c) => (
              <div key={`${c.pos}${c.kind}`} className={`lab-cap ${c.kind}`} data-cap data-s="">
                <i className="lab-dot" />
                <div className="lab-bub" role={phase === 'on' ? 'status' : undefined}>
                  <b>{c.line}</b>
                  <span>{[c.at, c.sub].filter(Boolean).join(' · ')}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
      <LabFoot
        mode={l.mode}
        phase={phase}
        caps={caps}
        wrap={copy.wrap(l.today ? copy.by(l.clock) : l.period, final, wrapBest(l), l.source ? sourceName(l.source) : undefined)}
        lab={lab}
        onShare={l.onShare}
      />
    </>
  )
}

function wrapBest(l: LabIn): string {
  const b = best(l.labels, l.vals, l.bucket)
  if (!b) return ''
  return l.bucket === 'hour' ? copy.bestHour(b) : copy.bestDay(b)
}
