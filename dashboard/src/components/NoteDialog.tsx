// Leaving a note on a day. A note is almost always about a bump or a dip, so
// the dialog shows the period's traffic and you point at the day you mean,
// seeing what you are about to explain. Days outside the period come from the
// same calendar the date picker uses, not the browser's own.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { DialogActions } from './DialogActions'
import { Chevron } from './DatePicker'
import { Month } from './DateRangePopover'
import { toast } from './Toast'
import { api, type Annotation, type Site } from '../lib/api'
import { addDays, fmtDay, type ISODate } from '../lib/dates'
import { fmtInt } from '../lib/format'

export type DayBar = { day: ISODate; visitors: number }

const MAX = 140

export function NoteDialog({
  site,
  day,
  today,
  days,
  notes,
  onClose,
  onSaved,
}: {
  site: Site
  /** The day it opens on: the one being looked at, or today. */
  day: ISODate
  today: ISODate
  /** The period's days, when the chart is by day. Empty for hourly views. */
  days: DayBar[]
  notes: Annotation[]
  onClose: () => void
  onSaved: () => void
}) {
  const [on, setOn] = useState<ISODate>(day)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [calendar, setCalendar] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const noted = useMemo(() => new Set(notes.map((n) => n.day)), [notes])
  const here = notes.filter((n) => n.day === on)
  const bar = days.find((d) => d.day === on)
  const max = Math.max(1, ...days.map((d) => d.visitors))

  const move = (n: number) => {
    const next = addDays(on, n)
    if (next <= today) setOn(next)
  }

  const save = () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    api
      .addAnnotation(site.id, on, t)
      .then(() => {
        toast(`Note added to ${fmtDay(on)}`)
        onSaved()
        onClose()
      })
      .catch((e: Error) => toast(e.message, 'error'))
      .finally(() => setBusy(false))
  }

  // ← and → move the day from anywhere in the dialog except while typing.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.activeElement === input.current) return
      if (e.key === 'ArrowLeft') (e.preventDefault(), move(-1))
      if (e.key === 'ArrowRight') (e.preventDefault(), move(1))
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })

  return (
    <Modal label="Add a note" onClose={onClose} className="note-modal">
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <h2>Add a note</h2>

        {days.length > 1 && (
          <div className="note-strip" role="group" aria-label="Pick the day">
            {days.map((d) => (
              <button
                key={d.day}
                type="button"
                className={d.day === on ? 'on' : undefined}
                aria-pressed={d.day === on}
                aria-label={`${fmtDay(d.day, { weekday: true })}, ${fmtInt(d.visitors)} visitors${noted.has(d.day) ? ', has a note' : ''}`}
                title={`${fmtDay(d.day, { weekday: true })} · ${fmtInt(d.visitors)} visitors`}
                onClick={() => setOn(d.day)}
              >
                {noted.has(d.day) && <i className="note-dot" aria-hidden="true" />}
                <span style={{ height: `${Math.max(6, (d.visitors / max) * 100)}%` }} />
              </button>
            ))}
          </div>
        )}

        <div className="note-day">
          <button type="button" className="btn icon ghost" aria-label="The day before" onClick={() => move(-1)}>
            <Chevron dir="left" />
          </button>
          <button type="button" className="note-day-label" aria-expanded={calendar} onClick={() => setCalendar((c) => !c)}>
            <b>{fmtDay(on, { weekday: true, year: on.slice(0, 4) !== today.slice(0, 4) })}</b>
            <span className="faint num">{bar ? `${fmtInt(bar.visitors)} visitors` : on === today ? 'today' : 'pick from the calendar'}</span>
          </button>
          <button type="button" className="btn icon ghost" aria-label="The day after" disabled={on >= today} onClick={() => move(1)}>
            <Chevron dir="right" />
          </button>
        </div>

        {calendar && (
          <DayCalendar
            value={on}
            today={today}
            onPick={(d) => {
              setOn(d)
              setCalendar(false)
              input.current?.focus()
            }}
          />
        )}

        <div className="note-input">
          <input
            ref={input}
            className="input"
            value={text}
            maxLength={MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder="What happened? A launch, a post, an outage…"
            aria-label={`Note for ${fmtDay(on, { weekday: true })}`}
            autoFocus
          />
          <span className="faint num" aria-hidden="true">
            {MAX - text.length}
          </span>
        </div>

        {here.length > 0 && (
          <ul className="note-list" aria-label="Notes already on this day">
            {here.map((n) => (
              <li key={n.id}>
                <span>{n.text}</span>
                <button
                  type="button"
                  aria-label={`Remove note: ${n.text}`}
                  onClick={() =>
                    api
                      .deleteAnnotation(site.id, n.id)
                      .then(() => (toast('Note removed'), onSaved()))
                      .catch((e: Error) => toast(e.message, 'error'))
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
          }
        >
          <button type="submit" className="btn primary big" disabled={busy || !text.trim()}>
            {busy ? 'Saving…' : 'Add note'}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}

/** One month at a time, in the dashboard's own calendar. */
function DayCalendar({ value, today, onPick }: { value: ISODate; today: ISODate; onPick: (d: ISODate) => void }) {
  const [month, setMonth] = useState(value.slice(0, 7) + '-01')
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(d.toISOString().slice(0, 10))
  }
  const latest = month >= today.slice(0, 7) + '-01'
  return (
    <div className="note-cal">
      <div className="note-cal-nav">
        <button type="button" className="btn icon ghost" aria-label="Previous month" onClick={() => shift(-1)}>
          <Chevron dir="left" />
        </button>
        <button type="button" className="btn icon ghost" aria-label="Next month" disabled={latest} onClick={() => shift(1)}>
          <Chevron dir="right" />
        </button>
      </div>
      <Month
        month={month}
        today={today}
        minDate="2000-01-01"
        range={{ from: value, to: value }}
        other={null}
        color="var(--accent)"
        otherColor="var(--text-3)"
        focusDay={value}
        onPick={onPick}
        onHover={() => {}}
      />
    </div>
  )
}
