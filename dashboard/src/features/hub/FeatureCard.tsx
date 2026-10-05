// One feature: its picture, name and line, what state it is in, and either
// the switch (a module, for an owner) or Open.
import { Switch } from '../../components/Switch'
import type { Status } from './model'
import { copy } from './copy'
import { ICONS } from './icons'
import type { Feature } from './registry'
import { words } from './words'

export interface CardProps {
  f: Feature
  status: Status
  /** An owner may switch this module. */
  toggle: boolean
  busy: boolean
  canOpen: boolean
  onToggle: () => void
  onOpen: () => void
}

/** The status word: a module an owner can switch says "Try it" while it is off. */
function label(status: Status, toggle: boolean): string {
  if (status === 'off') return toggle ? copy.tryIt : copy.off
  return copy[status]
}

export function FeatureCard({ f, status, toggle, busy, canOpen, onToggle, onOpen }: CardProps) {
  const Icon = ICONS[f.id]
  const w = words[f.id as keyof typeof words]
  return (
    <li id={'feat-' + f.id} className="feat">
      <span className="feat-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="feat-text">
        <b>{w.name}</b>
        <span className="faint">{w.line}</span>
      </span>
      <span className="feat-end">
        <span className={'tag' + (status === 'on' ? '' : ' quiet')}>{label(status, toggle)}</span>
        {toggle && <Switch on={status === 'on'} label={w.name} disabled={busy} onChange={onToggle} />}
        {canOpen && (
          <button type="button" className="btn" aria-label={copy.open + ': ' + w.name} onClick={onOpen}>
            {copy.open}
          </button>
        )}
      </span>
    </li>
  )
}
