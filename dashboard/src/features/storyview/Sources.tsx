// The hero's right side, open on the page: where the period's visitors came
// from as a ring (a stacked bar on a phone), the biggest sources with large
// numbers, and the top countries beneath. No card, no chart axes; it draws in
// once, with or without reduced motion.
import { donutArcs } from '../../charts/donutModel'
import { countryName, flag, fmtPct } from '../../lib/format'
import { channelColor, channelLabel } from '../../lib/palette'
import { copy } from './copy'
import type { Sources as Facts } from './sourcesOf'

const RADIUS = 15.9155 // a circumference of 100: a dash length is a percent

export function Sources({ s }: { s: Facts }) {
  const arcs = donutArcs(s.all.map((x) => ({ key: x.value, value: x.share })), s.all.length > 1 ? 1.2 : 0)
  const only = s.all.length === 1 ? s.all[0] : undefined
  return (
    <section className="sv-src" aria-label={copy.srcLabel}>
      <div className="sv-src-main">
        <svg className="sv-ring" viewBox="0 0 40 40" role="img" aria-label={copy.srcLabel}>
          <circle cx="20" cy="20" r={RADIUS} className="sv-ring-bg" />
          {arcs.map((a, i) => (
            <circle key={a.key} cx="20" cy="20" r={RADIUS} className="sv-ring-arc" stroke={channelColor(a.key)} strokeDasharray={`${a.length} ${100 - a.length}`} strokeDashoffset={-a.offset} style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </svg>
        <ul className="sv-src-list">
          {s.top.map((x) => (
            <li key={x.value}>
              <b className="num sv-src-n">{fmtPct(x.share)}</b>
              <span className="sv-src-k">
                <i style={{ background: channelColor(x.value) }} aria-hidden="true" />
                {channelLabel(x.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="sv-bar" aria-hidden="true">
        {s.all.map((x) => (
          <i key={x.value} style={{ flexGrow: x.share, background: channelColor(x.value) }} />
        ))}
      </div>
      {only && <p className="sv-src-note">{copy.srcOnly(channelLabel(only.value))}</p>}
      {s.countries.length > 0 && (
        <ul className="sv-ctry" aria-label={copy.srcCountries}>
          {s.countries.map((c) => (
            <li key={c.value}>
              <span aria-hidden="true">{flag(c.value)}</span> {countryName(c.value)} <b className="num">{fmtPct(c.share)}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
