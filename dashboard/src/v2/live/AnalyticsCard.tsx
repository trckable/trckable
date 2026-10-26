// Live's first card under the half hour: today's visitors, and where they are, as a bar list of the pages or of the
// countries behind one small switch.
import { useState } from 'react'
import { countryName, fmtInt, flag } from '../../lib/format'
import { copy } from './copy'
import { CardSkeleton } from './CardSkeleton'
import { todayBand, type Lists } from './liveModel'
import type { LiveNow } from '../../features/live/api'

type Mode = 'pages' | 'countries' | 'devices'

interface Props {
  today: LiveNow['today']
  /** undefined while the day's own lists are read. */
  lists?: Lists
}

interface Bar {
  key: string
  label: string
  n: number
  mono: boolean
  flag?: string
}

function barsOf(lists: Lists, mode: Mode): Bar[] {
  if (mode === 'pages') return lists.pages.map((p) => ({ key: p.label, label: p.label, n: p.n, mono: true }))
  if (mode === 'devices') return lists.devices.map((d) => ({ key: d.key, label: copy[d.key], n: d.n, mono: false }))
  return lists.countries.map((c) => ({ key: c.key, label: c.label || countryName(c.key), n: c.n, mono: false, flag: flag(c.key) }))
}

export function AnalyticsCard({ today, lists }: Props) {
  const [mode, setMode] = useState<Mode>('pages')
  const tb = today ? todayBand(today.visitors, today.before, today.compare) : null
  const rows = lists ? barsOf(lists, mode) : []
  const max = Math.max(1, ...rows.map((r) => r.n))
  return (
    <section className="mk-card lcard lan">
      <div className="ph">
        <span className="t">{copy.analytics}</span>
        <div className="mk-cs lsw" role="group" aria-label={copy.analytics}>
          {(['pages', 'countries', 'devices'] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {copy[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="pb">
        {today && today.visitors > 0 && (
          <div className="lbig lhero">
            {fmtInt(today.visitors)}
            <small>{copy.visitors}</small>
            {tb && <span className="mk-tag new lhword">{tb.word === 'usual' ? copy.usualWord : copy[tb.word]}</span>}
          </div>
        )}
        {!lists && <CardSkeleton kind="rows" />}
        <div className="lbars">
          {rows.map((r, i) => (
            <div className={`lbar${i === 0 ? ' top' : ''}`} key={r.key}>
              <i style={{ width: `${(r.n / max) * 100}%` }} />
              <span className={r.mono ? 'mono' : undefined}>
                {r.flag && <span className="lflag">{r.flag}</span>}
                {r.label}
              </span>
              <b>{r.n}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
