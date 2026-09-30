// The notes on the chart: a small flag on the x-axis at each day that has
// any, never a label that runs off the edge. Pointing at one (or focusing it
// from the keyboard) shows its notes; a tap pins them open on a phone. Every
// note of one day is one flag with a count.
import { useEffect, useId, useState } from 'react'
import type { Annotation } from '../../lib/api'
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'
import { tipLeft, type Marker } from './markers'
import './notes.css'

const TIP_W = 260
/** The flag is this tall (and wide); its tooltip sits just above it, never
 *  over it, and at either end of the chart it steps in rather than out. */
const MARK_H = 24
/** At most this many notes in one tooltip; the list has the rest. */
const TIP_MAX = 4
/** The guide a flag draws up the chart stops this far below its top. */
const GUIDE_TOP = 8

export function NoteMarkers({ markers, x, top, width }: { markers: Marker[]; x: (i: number) => number; top: number; width: number }) {
  const [open, setOpen] = useState<number | null>(null)
  const [pinned, setPinned] = useState(false)
  const id = useId()

  // A pinned tooltip closes on Escape or a tap anywhere else.
  useEffect(() => {
    if (open == null) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    const away = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.note-mark')) setOpen(null)
    }
    document.addEventListener('keydown', esc)
    document.addEventListener('pointerdown', away)
    return () => {
      document.removeEventListener('keydown', esc)
      document.removeEventListener('pointerdown', away)
    }
  }, [open])

  const shown = markers.find((m) => m.i === open)
  // A week or a month on the chart can hold notes of several days: then each
  // note says its own day instead of one heading for all.
  const oneDay = !!shown && shown.notes.every((n) => n.day === shown.day)
  return (
    <>
      {markers.map((m) => (
        <button
          key={m.i}
          type="button"
          className={m.i === open ? 'note-mark on' : 'note-mark'}
          style={{ left: `clamp(var(--note-half, ${MARK_H / 2}px), ${x(m.i)}px, calc(100% - var(--note-half, ${MARK_H / 2}px)))`, top, ['--rise' as string]: `max(0px, calc(${top - GUIDE_TOP}px - (2 * var(--note-half, ${MARK_H / 2}px))))` }}
          aria-label={copy.marker(m.notes.length, m.day)}
          aria-describedby={m.i === open ? id : undefined}
          aria-expanded={m.i === open}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={(e) => e.pointerType === 'mouse' && !pinned && setOpen(m.i)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && !pinned && setOpen(null)}
          onFocus={() => setOpen(m.i)}
          onBlur={() => !pinned && setOpen(null)}
          onClick={(e) => {
            e.stopPropagation()
            const again = open === m.i && pinned
            setPinned(!again)
            setOpen(again ? null : m.i)
          }}
        >
          <span className="note-guide" aria-hidden="true" />
          <i className={m.notes.length > 1 ? 'num many' : 'num'} aria-hidden="true">
            {m.notes.length > 1 ? m.notes.length : null}
          </i>
        </button>
      ))}
      {shown && (
        <div id={id} role="tooltip" className="note-tip" style={{ left: tipLeft(x(shown.i), TIP_W, width), width: Math.min(TIP_W, width - 8), bottom: `calc(100% - ${top - 4}px + (2 * var(--note-half, ${MARK_H / 2}px)))`, maxHeight: `max(60px, calc(${top - 8}px - (2 * var(--note-half, ${MARK_H / 2}px))))` }}>
          {oneDay && <strong className="note-tip-day num">{fmtDay(shown.day, { weekday: true, year: true })}</strong>}
          {shown.notes.slice(0, TIP_MAX).map((n) => (
            <NoteLine key={n.id} n={n} day={!oneDay} />
          ))}
          {shown.notes.length > TIP_MAX && <span className="faint">{copy.more(shown.notes.length - TIP_MAX)}</span>}
        </div>
      )}
    </>
  )
}

function NoteLine({ n, day }: { n: Annotation; day: boolean }) {
  return (
    <div className="note-line">
      <p>{n.text}</p>
      {(day || n.author) && (
        <span className="faint">
          {day && <span className="num">{fmtDay(n.day, { weekday: true })}</span>}
          {day && n.author && ' · '}
          {n.author && copy.by(n.author)}
        </span>
      )}
    </div>
  )
}
