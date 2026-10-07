// Where the people on the site are from: the biggest country as the big number
// with its flag in the icon tile, one segmented bar along the card's bottom
// edge, the top countries as chips that narrow Data, and phone against computer.
import { Card } from '../../kit/Card'
import { DeviceIcon } from '../../components/visitor/DeviceIcon'
import { countryName, flag } from '../../lib/format'
import { pct } from './model'
import { cardsCopy as t } from './cardsCopy'
import type { Places } from './cardsModel'
import { openExplore, openFiltered } from './cardsOpen'

const SHADES = ['var(--text-2)', 'var(--text-3)', 'var(--text-4)']

export function CountryCard({ places }: { places: Places }) {
  const [top, ...rest] = places.parts
  return (
    <Card
      stretch
      className="kit-metric lv-card"
      icon={<span aria-hidden="true">{flag(top.key)}</span>}
      title={t.placesTitle}
      status={countryName(top.key)}
      openLabel={t.open(t.placesTitle)}
      onOpen={() => void openExplore()}
      chart={
        <span className="kit-segbar" aria-hidden="true">
          {places.parts.map((p, i) => (
            <i key={p.key} style={{ flex: p.share, background: SHADES[i] }} />
          ))}
        </span>
      }
    >
      <span className="kit-val">
        <b className="num">{pct(top.share)}</b>
        <span className="kit-val-name">{countryName(top.key)}</span>
      </span>
      <span className="kit-chips">
        {[top, ...rest].map((p) => (
          <button key={p.key} type="button" className="kit-chip" onClick={() => void openFiltered('country', p.key)} aria-label={t.openPlace(countryName(p.key), p.n)}>
            <span aria-hidden="true">{flag(p.key)}</span> {countryName(p.key)} <b className="num">{pct(p.share)}</b>
          </button>
        ))}
        {places.mobile + places.desktop > 0 && (
          <>
            <span className="kit-chip static">
              <DeviceIcon device="mobile" size={13} /> {t.mobile} <b className="num">{pct(places.mobile)}</b>
            </span>
            <span className="kit-chip static">
              <DeviceIcon device="desktop" size={13} /> {t.desktop} <b className="num">{pct(places.desktop)}</b>
            </span>
          </>
        )}
      </span>
    </Card>
  )
}
