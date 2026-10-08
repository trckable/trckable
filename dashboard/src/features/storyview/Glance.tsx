// The hero's right side: the sentence made visible. The period's visitors as a
// soft area with the period before behind it, dashed, then the three facts the
// sentence names: top source, top country, busiest day. Data the Story has.
import { Activity, CalendarDays, Globe, Route } from 'lucide-react'
import type { ReactNode } from 'react'
import { Area, Card } from '../../kit'
import { fmtDay } from '../../lib/dates'
import { countryName, flag, fmtInt, fmtPct } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import { copy } from './copy'
import type { Glance as Facts } from './glanceFacts'

const day = (t: string) => fmtDay(t.slice(0, 10))

function Share({ icon, name, label, share }: { icon: ReactNode; name: string; label: string; share: number }) {
  return (
    <li className="sv-gl-row">
      <span className="sv-gl-ic" aria-hidden="true">
        {icon}
      </span>
      <span className="sv-gl-k">{label}</span>
      <span className="sv-gl-v">{name}</span>
      <span className="sv-gl-bar" aria-hidden="true">
        <i style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
      </span>
      <b className="num sv-gl-n">{fmtPct(share)}</b>
    </li>
  )
}

export function Glance({ g }: { g: Facts }) {
  const { source, country } = g
  return (
    <Card className="sv-glance" icon={<Activity size={15} strokeWidth={1.8} />} title={copy.glanceTitle} label={copy.glanceLabel}>
      <div className="sv-gl-plot" role="img" aria-label={copy.chartLabel}>
        <Area values={g.values} was={g.was} slots={Math.max(g.values.length, g.was?.length ?? 0)} color="var(--accent)" />
      </div>
      <div className="sv-gl-axis" aria-hidden="true">
        <span>{day(g.first)}</span>
        {g.was && <span className="sv-gl-key">{copy.before}</span>}
        <span>{day(g.last)}</span>
      </div>
      <ul className="sv-gl-rows">
        {source && <Share icon={<Route size={14} strokeWidth={1.8} />} label={copy.glanceSource} name={channelLabel(source.value)} share={source.share} />}
        {country && <Share icon={<Globe size={14} strokeWidth={1.8} />} label={copy.glanceCountry} name={`${flag(country.value)} ${countryName(country.value)}`.trim()} share={country.share} />}
        <li className="sv-gl-row">
          <span className="sv-gl-ic" aria-hidden="true">
            <CalendarDays size={14} strokeWidth={1.8} />
          </span>
          <span className="sv-gl-k">{copy.glancePeak}</span>
          <span className="sv-gl-v">{day(g.peak.t)}</span>
          <b className="num sv-gl-n sv-gl-wide">{copy.glancePeakN(fmtInt(g.peak.visitors))}</b>
        </li>
      </ul>
    </Card>
  )
}
