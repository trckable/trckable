// Where the people on the site are from: the top three countries as blocks
// sized by their share, each a button that narrows Data, and phone against computer.
import { Globe } from 'lucide-react'
import { DeviceIcon } from '../../components/visitor/DeviceIcon'
import { SplitBlocks } from '../../kit'
import { countryName, flag } from '../../lib/format'
import { pct } from './model'
import { cardsCopy as t } from './cardsCopy'
import type { Places } from './cardsModel'
import { openExplore, openFiltered } from './cardsOpen'

const SHADES = ['var(--accent)', 'color-mix(in srgb, var(--accent) 58%, var(--surface))', 'color-mix(in srgb, var(--accent) 28%, var(--surface))']

export function CountryCard({ places }: { places: Places }) {
  return (
    <SplitBlocks
      variant="open"
      stretch
      className="lv-card"
      title={
        <>
          <Globe size={15} strokeWidth={1.8} aria-hidden="true" /> {t.placesTitle}
        </>
      }
      openLabel={t.open(t.placesTitle)}
      onOpen={() => void openExplore()}
      items={places.parts.map((p, i) => ({
        key: p.key,
        label: (
          <>
            <span aria-hidden="true">{flag(p.key)}</span> {countryName(p.key)}
          </>
        ),
        share: p.share * 100,
        color: SHADES[i],
        onPick: () => void openFiltered('country', p.key),
        pickLabel: t.openPlace(countryName(p.key), p.n),
      }))}
    >
      {places.mobile + places.desktop > 0 && (
        <p className="kit-sub kit-devs">
          <span>
            <DeviceIcon device="mobile" size={13} /> {t.mobile} <b className="num">{pct(places.mobile)}</b>
          </span>
          <span>
            <DeviceIcon device="desktop" size={13} /> {t.desktop} <b className="num">{pct(places.desktop)}</b>
          </span>
        </p>
      )}
    </SplitBlocks>
  )
}
