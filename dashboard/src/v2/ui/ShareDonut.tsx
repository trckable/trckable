// Who brought the people: a ring split by share, with the site's people in its middle: one person can come by two
// channels, so the parts can add up to more. Pointing at a part names it.
import { motion } from 'motion/react'
import { useState } from 'react'
import { fmtInt, fmtPct } from '../../lib/format'

const R = 56
const LEN = 2 * Math.PI * R
const GAP = 3

export function ShareDonut({ parts, label, people }: { parts: { key: string; name: string; v: number; color: string }[]; label: string; people: number }) {
  const [hot, setHot] = useState<string | null>(null)
  const total = parts.reduce((p, s) => p + s.v, 0) || 1
  const on = parts.find((p) => p.key === hot)
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((p, s) => p + s.v, 0))
  return (
    <div className="dn-ring" role="img" aria-label={label}>
      <svg viewBox="0 0 140 140" onPointerLeave={() => setHot(null)}>
        {parts.map((p, i) => {
          const len = Math.max(1, (p.v / total) * LEN - GAP)
          return (
            <motion.circle
              key={p.key}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={p.color}
              strokeWidth={hot === p.key ? 19 : 15}
              opacity={hot && hot !== p.key ? 0.3 : 1}
              strokeDashoffset={-(starts[i] / total) * LEN}
              initial={{ strokeDasharray: `0 ${LEN}` }}
              animate={{ strokeDasharray: `${len} ${LEN}` }}
              transition={{ duration: 0.8, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              onPointerEnter={() => setHot(p.key)}
            />
          )
        })}
      </svg>
      <div className="dn-mid">
        <b>{fmtInt(on ? on.v : people)}</b>
        <span>{on ? `${on.name} · ${fmtPct(on.v / total)}` : label}</span>
      </div>
    </div>
  )
}
