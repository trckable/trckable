// The four options under the name: each a row with its icon, its name and
// its control, so the whole list reads at a glance.
import { Calendar, CircleDollarSign, Clock, Code, StickyNote } from 'lucide-react'
import type { ReactNode } from 'react'
import { Switch } from '../../components/Switch'
import { copy } from './copy'
import { MAX_DAYS, daysUntil, endDate, originsError, parseOrigins, type Draft, type Expiry } from './logic'

type Patch = (p: Partial<Draft>) => void

function Opt({ icon, label, children, below }: { icon: ReactNode; label: string; children: ReactNode; below?: ReactNode }) {
  return (
    <div className="sl-opt">
      <span className="sl-opt-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sl-opt-label">{label}</span>
      <div className="sl-opt-control">{children}</div>
      {below && <div className="sl-opt-below">{below}</div>}
    </div>
  )
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const CHOICES: { id: Expiry; label: string }[] = [
  { id: 'never', label: copy.never },
  { id: '7', label: copy.d7 },
  { id: '30', label: copy.d30 },
]

function Expires({ draft, set }: { draft: Draft; set: Patch }) {
  const bad = draft.expiry === 'date' && daysUntil(draft.date) === null
  return (
    <Opt
      icon={<Clock size={15} strokeWidth={1.75} />}
      label={copy.expires}
      below={
        draft.expiry === 'date' && (
          <input
            className="input sl-date"
            type="date"
            aria-label={copy.date}
            aria-invalid={bad}
            min={iso(endDate(1))}
            max={iso(endDate(MAX_DAYS))}
            value={draft.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        )
      }
    >
      <div className="seg small" role="group" aria-label={copy.expires}>
        {CHOICES.map((c) => (
          <button key={c.id} type="button" aria-pressed={draft.expiry === c.id} onClick={() => set({ expiry: c.id })}>
            {c.label}
          </button>
        ))}
        <button type="button" aria-pressed={draft.expiry === 'date'} aria-label={copy.pickDate} title={copy.pickDate} onClick={() => set({ expiry: 'date' })}>
          <Calendar size={13} strokeWidth={1.75} />
        </button>
      </div>
    </Opt>
  )
}

export function Options({ draft, set }: { draft: Draft; set: Patch }) {
  const err = draft.embed ? originsError(parseOrigins(draft.sites)) : null
  return (
    <div className="sl-opts">
      <Opt icon={<CircleDollarSign size={15} strokeWidth={1.75} />} label={copy.revenue}>
        <Switch on={draft.revenue} label={copy.revenue} onChange={() => set({ revenue: !draft.revenue })} />
      </Opt>
      <Opt icon={<StickyNote size={15} strokeWidth={1.75} />} label={copy.notes}>
        <Switch on={draft.notes} label={copy.notes} onChange={() => set({ notes: !draft.notes })} />
      </Opt>
      <Expires draft={draft} set={set} />
      <Opt
        icon={<Code size={15} strokeWidth={1.75} />}
        label={copy.embed}
        below={
          draft.embed && (
            <>
              <input
                className="input mono"
                aria-label={copy.embedField}
                aria-invalid={!!err}
                placeholder={copy.embedPlaceholder}
                autoComplete="off"
                spellCheck={false}
                value={draft.sites}
                onChange={(e) => set({ sites: e.target.value })}
              />
              {err && (
                <span role="alert" className="sl-err">
                  {err}
                </span>
              )}
            </>
          )
        }
      >
        <Switch on={draft.embed} label={copy.embed} onChange={() => set({ embed: !draft.embed })} />
      </Opt>
    </div>
  )
}
