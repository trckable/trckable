// A number whose changed digits slide to the new ones (up when it grows, down
// when it shrinks), the rest standing still. Transforms only; with reduced
// motion it simply changes. Screen readers hear the final value once.
import { useState } from 'react'
import { reducedMotion } from '../lib/motion'
import './rolling.css'

export type Roll = { cur: string; prev: string; value: number; dir: 1 | -1; n: number }
export type Cell = { from: string; to: string; moves: boolean }

/** The state after the number became `value`, shown as `text`. */
export function nextRoll(roll: Roll, value: number, text: string, reduced: boolean): Roll {
  if (text === roll.cur) return roll
  return { cur: text, prev: reduced ? text : roll.cur, value, dir: value >= roll.value ? 1 : -1, n: roll.n + 1 }
}

/** One cell per position, right-aligned: only the cells that differ move. */
export function cells(prev: string, cur: string): Cell[] {
  const len = Math.max(prev.length, cur.length)
  const a = prev.padStart(len)
  const b = cur.padStart(len)
  return Array.from(b, (c, i) => ({ from: a[i].trim(), to: c.trim(), moves: a[i] !== c }))
}

export function RollingNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const text = format(value)
  const [roll, setRoll] = useState<Roll>({ cur: text, prev: text, value, dir: 1, n: 0 })
  const r = nextRoll(roll, value, text, reducedMotion())
  // Derived from the new value while rendering, so no frame shows it unrolled.
  if (r !== roll) setRoll(r)
  const rolled = r.prev !== r.cur
  const up = r.dir > 0
  return (
    <span className={className ? `rn ${className}` : 'rn'} aria-live="polite" aria-atomic="true">
      <span className="rn-text">{text}</span>
      <span className={rolled ? `rn-digits rn-${up ? 'up' : 'down'}` : 'rn-digits'} key={rolled ? r.n : 'still'} aria-hidden="true">
        {cells(r.prev, r.cur).map((c, i) =>
          rolled && c.moves ? (
            <span key={i} className="rn-slot">
              <span className={up ? 'rn-col' : 'rn-col rn-col-down'}>
                <span className="rn-g">{up ? c.from : c.to}</span>
                <span className="rn-g">{up ? c.to : c.from}</span>
              </span>
            </span>
          ) : (
            <span key={i} className="rn-g">{c.to}</span>
          ),
        )}
      </span>
    </span>
  )
}
