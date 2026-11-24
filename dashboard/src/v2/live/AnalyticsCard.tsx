// Live's first card under the half hour: where today's people are, as a bar list of the pages or of the
// countries behind one small switch.
import { useState, type ReactNode } from 'react'
import { countryName } from '../../lib/format'
import { copy } from './copy'
import { CardSkeleton } from './CardSkeleton'
import type { Lists } from './liveModel'
import type { LiveNow } from '../../features/live/api'
import { Flag } from '../ui/Flag'
import { deviceLabel, type DeviceKey } from '../../lib/deviceName'
import { logoOf } from '../explore/rowMarks'
import { appOf } from '../../features/apps/copy'

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
  mark?: ReactNode
}

// The system whose logo each device wears; Other has none.
const MARKS: Partial<Record<DeviceKey, string>> = { iphone: 'ios', ipad: 'ios', mac: 'macos', androidPhone: 'android', androidTablet: 'android', windowsPc: 'windows', linux: 'linux' }

function barsOf(lists: Lists, mode: Mode): Bar[] {
  if (mode === 'pages') return lists.pages.map((p) => ({ key: p.label, label: p.label, n: p.n, mono: true }))
  if (mode === 'devices')
    return lists.devices.map((d) => {
      const [device, app] = d.key.split(':') as [DeviceKey, string?]
      const name = deviceLabel(device)
      return { key: d.key, label: app ? appOf(name) : name, n: d.n, mono: false, mark: logoOf(MARKS[device] ?? '') }
    })
  return lists.countries.map((c) => ({ key: c.key, label: c.label || countryName(c.key), n: c.n, mono: false, flag: c.key }))
}

export function AnalyticsCard({ today, lists }: Props) {
  const [mode, setMode] = useState<Mode>('pages')
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
        {!lists && <CardSkeleton kind="rows" />}
        {lists && !(today && today.visitors > 0) && rows.length === 0 && <p className="mk-quiet">{copy.noneToday}</p>}
        <div className="lbars">
          {rows.map((r, i) => (
            <div className={`lbar${i === 0 ? ' top' : ''}`} key={r.key}>
              <i style={{ width: `${(r.n / max) * 100}%` }} />
              <span className={r.mono ? 'mono' : undefined}>
                {r.flag && <span className="lflag"><Flag code={r.flag} /></span>}
                {r.mark && <span className="lflag">{r.mark}</span>}
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
