// The half hour, drawn as bars or as a line over the same minutes: both stay in the page and crossfade, and each minute opens in the numbers.
import { openMinute } from '../../features/live/switchView'
import { useEffect, useRef, useState } from 'react'
import { Tip, type TipAt } from '../../charts/Tip'
import type { ChartMode } from './chartMode'
import { copy } from './copy'
import { LiveLineChart } from './LiveLineChart'

interface Props {
  bars: { h: number; z: boolean; n: number }[]
  /** The same minutes as people on the site, which the line draws. */
  people: { h: number; z: boolean; n: number }[]
  mode: ChartMode
  total: number
  beat: number
  /** The minute the chart ends on: when it moves on, the bars slide one place left. */
  minute: number
  /** A thumb taps the minute; it is no target to tab to. */
  phone: boolean
  timezone: string
  /** The clock time of the minute that many minutes ago. */
  label: (ago: number) => string
}

const ARROW: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }

export function MinuteChart({ bars, people, mode, total, beat, minute, phone, timezone, label }: Props) {
  const [first] = useState(minute)
  const box = useRef<HTMLDivElement>(null)
  // The minute the tooltip shows, and where it points; a thumb's first tap shows it, the next tap on the same minute opens it.
  const [shown, setShown] = useState<{ i: number; x: number; w: number } | null>(null)
  const touched = useRef(false)
  const show = (i: number, el: Element) => {
    const c = box.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (c) setShown({ i, x: r.left + r.width / 2 - c.left, w: c.width })
  }
  useEffect(() => {
    if (!shown) return
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setShown(null)
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [shown])
  const words = (i: number, m: ChartMode = mode) => (m === 'line' ? copy.peopleAt(people[i].n) : copy.viewsAt(bars[i].n))
  const tip: TipAt | null = shown && bars[shown.i] ? { x: shown.x, y: 22, body: <><b>{label(bars.length - 1 - shown.i)}</b><span className="num">{words(shown.i)}</span></> } : null
  const hit = (i: number, m: ChartMode) => {
    const ago = bars.length - 1 - i
    return {
      role: phone ? undefined : 'button',
      tabIndex: phone ? undefined : 0,
      'aria-label': `${label(ago)}, ${words(i, m)}. ${copy.openMinute(label(ago))}`,
      onPointerDown: (e: React.PointerEvent) => void (touched.current = e.pointerType === 'touch'),
      onPointerEnter: (e: React.PointerEvent) => e.pointerType !== 'touch' && show(i, e.currentTarget),
      // Some browsers jump the pointer onto a minute without the out event React pairs the enter with, so a move shows it too.
      onPointerMove: (e: React.PointerEvent) => e.pointerType !== 'touch' && shown?.i !== i && show(i, e.currentTarget),
      onPointerLeave: (e: React.PointerEvent) => e.pointerType !== 'touch' && setShown(null),
      onFocus: (e: React.FocusEvent) => e.currentTarget.matches(':focus-visible') && show(i, e.currentTarget),
      onBlur: () => setShown(null),
      onClick: (e: React.MouseEvent) => {
        if (touched.current && shown?.i !== i) show(i, e.currentTarget)
        else void openMinute(ago, timezone)
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          void openMinute(ago, timezone)
          return
        }
        const step = ARROW[e.key]
        const next = step ? e.currentTarget.parentElement?.children[i + step] : null
        if (next instanceof HTMLElement) {
          e.preventDefault()
          next.focus()
        }
      },
    }
  }
  // A thumb pressed and dragged along the line follows the minutes under it (a mouse has its own enter and move on each minute).
  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return
    const hits = e.currentTarget.children
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.max(0, Math.min(hits.length - 1, Math.floor(((e.clientX - r.left) / r.width) * hits.length)))
    if (hits[i] && shown?.i !== i) show(i, hits[i])
  }
  const on = (m: ChartMode) => (mode === m ? {} : { 'aria-hidden': true, inert: true })
  return (
    <div key={minute} ref={box} className={minute === first ? 'lchart' : 'lchart shift'} data-mode={mode}>
      <div className="mins" role="group" aria-label={copy.minsLabel(total)} {...on('bars')}>
        {bars.map((b, i) => (
          <i key={i} className={b.z ? 'z' : ''} style={{ height: `${b.h}%` }} {...hit(i, 'bars')} />
        ))}
      </div>
      <div className="mline" role="group" aria-label={copy.peopleLabel} {...on('line')}>
        <LiveLineChart heights={people.map((b) => b.h)} beat={beat} at={mode === 'line' ? (shown?.i ?? null) : null} onScrub={scrub} hits={people.map((b, i) => <i key={i} className={b.z ? 'z' : ''} {...hit(i, 'line')} />)} />
      </div>
      <Tip at={tip} width={shown?.w ?? 0} />
    </div>
  )
}
