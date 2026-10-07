// A ring of arcs sized by value, with a figure and a word in the middle.
// Decoration for a list beside it, which carries the same numbers.
import type { ReactNode } from 'react'
import { donutArcs } from './donutModel'

const R = 15.9155 // a circumference of 100
const WIDTH = 5

export function Donut(p: { slices: { key: string; value: number; color: string }[]; figure: ReactNode; caption?: ReactNode }) {
  const arcs = donutArcs(p.slices)
  const color = (key: string) => p.slices.find((s) => s.key === key)?.color
  return (
    <div className="donut" aria-hidden="true">
      <svg viewBox="0 0 42 42">
        <circle className="donut-track" cx="21" cy="21" r={R} fill="none" strokeWidth={WIDTH} />
        {arcs.map((a) => (
          <circle key={a.key} cx="21" cy="21" r={R} fill="none" stroke={color(a.key)} strokeWidth={WIDTH} strokeLinecap="round" strokeDasharray={`${a.length} ${100 - a.length}`} strokeDashoffset={-a.offset} />
        ))}
      </svg>
      <div className="donut-mid">
        <b className="num">{p.figure}</b>
        {p.caption && <small>{p.caption}</small>}
      </div>
    </div>
  )
}
