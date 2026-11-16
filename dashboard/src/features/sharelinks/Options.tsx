// The options under the name: what the link shows (revenue, notes) up front,
// and who can open it, until when and where it can be embedded under More.
// Each a row with its icon, its name and its control, so the list reads at a glance.
import { Calendar, ChevronDown, CircleDollarSign, Clock, Code, StickyNote } from 'lucide-react'
import { useState } from 'react'
import { Switch } from '../../components/Switch'
import { FieldError, fieldProps } from '../../kit/FieldError'
import { Access } from './Access'
import { copy } from './copy'
import { MAX_DAYS, daysUntil, endDate, originsError, parseOrigins, type Draft, type Expiry, type Problem } from './logic'
import { Opt } from './Opt'

type Patch = (p: Partial<Draft>) => void

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const CHOICES: { id: Expiry; label: string }[] = [
  { id: 'never', label: copy.never },
  { id: '7', label: copy.d7 },
  { id: '30', label: copy.d30 },
]

function Expires({ draft, set }: { draft: Draft; set: Patch }) {
  const bad = draft.expiry === 'date' && draft.date !== '' && daysUntil(draft.date) === null
  return (
    <Opt
      icon={<Clock size={15} strokeWidth={1.75} />}
      label={copy.expires}
      below={
        draft.expiry === 'date' && (
          <>
            <input
              className="input sl-date"
              type="date"
              aria-label={copy.date}
              {...fieldProps('sl-date-err', bad ? copy.dateBad : null)}
              min={iso(endDate(1))}
              max={iso(endDate(MAX_DAYS))}
              value={draft.date}
              onChange={(e) => set({ date: e.target.value })}
            />
            <FieldError id="sl-date-err" error={bad ? copy.dateBad : null} />
          </>
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

function Embed({ draft, set }: { draft: Draft; set: Patch }) {
  const err = draft.embed ? originsError(parseOrigins(draft.sites)) : null
  return (
    <Opt
      icon={<Code size={15} strokeWidth={1.75} />}
      label={copy.embed}
      below={
        draft.embed && (
          <>
            <input
              className="input mono"
              aria-label={copy.embedField}
              {...fieldProps('sl-embed-err', err)}
              placeholder={copy.embedPlaceholder}
              autoComplete="off"
              spellCheck={false}
              value={draft.sites}
              onChange={(e) => set({ sites: e.target.value })}
            />
            <FieldError id="sl-embed-err" error={err} />
          </>
        )
      }
    >
      <Switch on={draft.embed} label={copy.embed} onChange={() => set({ embed: !draft.embed })} />
    </Opt>
  )
}

/** Whether anything under More differs from the plain link: then it starts open. */
const customised = (d: Draft) => d.access === 'password' || d.expiry !== 'never' || d.embed

export function Options({ draft, set, blocked }: { draft: Draft; set: Patch; blocked: Problem | null }) {
  const [more, setMore] = useState(() => customised(draft))
  return (
    <>
      <div className="sl-opts">
        <Opt icon={<CircleDollarSign size={15} strokeWidth={1.75} />} label={copy.revenue}>
          <Switch on={draft.revenue} label={copy.revenue} onChange={() => set({ revenue: !draft.revenue })} />
        </Opt>
        <Opt icon={<StickyNote size={15} strokeWidth={1.75} />} label={copy.notes}>
          <Switch on={draft.notes} label={copy.notes} onChange={() => set({ notes: !draft.notes })} />
        </Opt>
      </div>
      <button type="button" className="sl-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
        {copy.more}
      </button>
      {more && (
        <div className="sl-opts" data-more="">
          <Access draft={draft} set={set} blocked={blocked} />
          <Expires draft={draft} set={set} />
          <Embed draft={draft} set={set} />
        </div>
      )}
    </>
  )
}
