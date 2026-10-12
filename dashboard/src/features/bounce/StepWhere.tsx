// Step 2: one row for each cause, with two bars: this period against the usual.
import { fmtPct } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import type { BounceCause } from '../../lib/apiMore'
import { PathChip } from '../signals/PathChip'
import { DeviceIcon } from '../../components/visitor/DeviceIcon'
import { SourceMark } from '../../components/visitor/SourceMark'
import { copy } from './copy'

function Bar({ label, value, tone }: { label: string; value: number; tone: 'now' | 'was' }) {
  return (
    <div className="bg-bar">
      <span className="muted">{label}</span>
      <span className="bg-track">
        <i className={tone} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <b>{fmtPct(value)}</b>
    </div>
  )
}

function Lead({ c, onSee }: { c: BounceCause; onSee: (page: string) => void }) {
  if (c.kind === 'source_device') {
    return (
      <span className="bg-lead">
        <SourceMark channel={c.source ?? ''} size={22} />
        <DeviceIcon device={c.device ?? ''} size={16} />
        {copy.sourceOn(channelLabel(c.source ?? ''), c.device ?? '')}
      </span>
    )
  }
  return (
    <span className="bg-lead">
      {c.kind === 'speed' ? copy.slowOn : copy.landingOn} <PathChip page={c.label} onPick={() => onSee(c.label)} />
    </span>
  )
}

export function StepWhere({ causes, onSee }: { causes: BounceCause[]; onSee: (page: string) => void }) {
  return (
    <ul className="bg-step bg-causes">
      {causes.map((c, i) => (
        <li key={c.kind + c.label} className="bg-cause" style={{ ['--i' as string]: i }}>
          <Lead c={c} onSee={onSee} />
          <span className="sg-chip bg-pill">{copy.ofVisits(fmtPct(c.share_of_visits))}</span>
          <Bar label={copy.now} value={c.rate} tone="now" />
          {c.was !== null && <Bar label={copy.usually} value={c.was} tone="was" />}
        </li>
      ))}
    </ul>
  )
}
