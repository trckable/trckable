// The uptime probe's last looks at the homepage, one line each: when, and what answered (or why not).
import { Check, CircleAlert, X } from 'lucide-react'
import type { ProbeLook } from '../../lib/apiMore'
import { copy } from './copy'
import { downCopy } from './downCopy'
import { when } from './time'

export function ProbeList({ probes }: { probes: ProbeLook[] }) {
  return probes.map((p) => {
    const kind = lookKind(p)
    const Icon = icons[kind]
    return (
    <li key={p.at} className={kind} data-probe={p.at}>
      <Icon size={15} strokeWidth={2.25} aria-hidden="true" />
      <span>
        <b>{when(p.at)}</b> {p.blocked ? `${downCopy.blockedLook} · ${p.status}` : p.error || (p.status ? copy.answered(p.status, p.ms ?? 0) : copy.noAnswer)}
      </span>
    </li>
    )
  })
}

const icons = { faint: CircleAlert, bad: X, ok: Check }

function lookKind(p: ProbeLook): keyof typeof icons {
  if (p.blocked) return 'faint'
  return p.error ? 'bad' : 'ok'
}
