// The uptime probe's last looks at the homepage, one line each: when, and what answered (or why not).
import { Check, CircleAlert, X } from 'lucide-react'
import type { ProbeLook } from '../../lib/apiMore'
import { copy } from './copy'
import { downCopy } from './downCopy'
import { when } from './time'

export function ProbeList({ probes }: { probes: ProbeLook[] }) {
  return probes.map((p) => (
    <li key={p.at} className={p.blocked ? 'faint' : p.error ? 'bad' : 'ok'} data-probe={p.at}>
      {p.blocked ? <CircleAlert size={15} strokeWidth={2.25} aria-hidden="true" /> : p.error ? <X size={15} strokeWidth={2.25} aria-hidden="true" /> : <Check size={15} strokeWidth={2.25} aria-hidden="true" />}
      <span>
        <b>{when(p.at)}</b> {p.blocked ? `${downCopy.blockedLook} · ${p.status}` : p.error || (p.status ? copy.answered(p.status, p.ms ?? 0) : copy.noAnswer)}
      </span>
    </li>
  ))
}
