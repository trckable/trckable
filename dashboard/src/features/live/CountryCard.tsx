// Where the people on the site are from: the biggest country's share, a bar
// split by the top three, each with its count, and phone against computer.
import { Globe } from 'lucide-react'
import { DeviceIcon } from '../../components/visitor/DeviceIcon'
import { countryName, flag } from '../../lib/format'
import { pct } from './model'
import { cardsCopy as t } from './cardsCopy'
import type { Places } from './cardsModel'
import { openExplore, openFiltered } from './cardsOpen'
import { LiveCard } from './LiveCard'

export function CountryCard({ places }: { places: Places }) {
  return (
    <LiveCard title={t.placesTitle} icon={<Globe size={15} strokeWidth={1.8} aria-hidden="true" />} onOpen={() => void openExplore()}>
      <div className="lv-big">
        <span className="lv-n num">
          <span aria-hidden="true">{flag(places.top.code)}</span> {pct(places.top.share)}
        </span>
      </div>
      <div className="lv-split" aria-hidden="true">
        {places.parts.map((p, i) => (
          <i key={p.key} className={`p${i}`} style={{ flexGrow: p.share }} />
        ))}
      </div>
      <ul className="lv-legend">
        {places.parts.map((p) => (
          <li key={p.key}>
            <button type="button" className="lv-chip" onClick={() => void openFiltered('country', p.key)} aria-label={t.openPlace(countryName(p.key), p.n)}>
              {countryName(p.key)} <b className="num">{p.n}</b>
            </button>
          </li>
        ))}
      </ul>
      {places.mobile + places.desktop > 0 && (
        <p className="lv-dev faint">
          <span>
            <DeviceIcon device="mobile" size={13} /> {t.mobile} <b className="num">{pct(places.mobile)}</b>
          </span>
          <span>
            <DeviceIcon device="desktop" size={13} /> {t.desktop} <b className="num">{pct(places.desktop)}</b>
          </span>
        </p>
      )}
    </LiveCard>
  )
}
