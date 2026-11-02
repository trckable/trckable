// A goal as a ring: the arc is its number against the page's biggest goal, the faint arc behind is where it usually sits. With no usual yet, only the number.
import NumberFlow from '@number-flow/react'
import { motion } from 'motion/react'
import type { Goal } from '../explore/types'

const R = 34
const LEN = 2 * Math.PI * R

export function GoalRing({ g, max }: { g: Goal; max: number }) {
  const color = g.st === 'dn' ? 'var(--mk-red)' : 'var(--mk-lime)'
  return (
    <div className={`gr ${g.st}`}>
      <div className="gr-ring">
        <svg viewBox="0 0 84 84" aria-hidden="true">
          <circle cx="42" cy="42" r={R} className="gr-track" />
          {g.hi > 0 && <circle cx="42" cy="42" r={R} className="gr-usual" strokeDasharray={`${((g.hi - g.lo) / max) * LEN} ${LEN}`} strokeDashoffset={-(g.lo / max) * LEN} />}
          <motion.circle cx="42" cy="42" r={R} className="gr-val" stroke={color} strokeDasharray={LEN} initial={{ strokeDashoffset: LEN }} animate={{ strokeDashoffset: LEN * (1 - g.v / max) }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
        </svg>
        <b style={{ color: g.st === 'dn' ? color : undefined }}><NumberFlow value={g.v} /></b>
      </div>
      <span title={g.name}>{g.name}</span>
    </div>
  )
}
