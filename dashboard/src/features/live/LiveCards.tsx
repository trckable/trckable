// One row of three cards under the Live panels. A card with nothing to say
// is left out, and with none the row is not there at all.
import type { LiveNow } from './api'
import { CountryCard } from './CountryCard'
import { placesOf, topPages } from './cardsModel'
import type { Row } from './model'
import { PagesCard } from './PagesCard'
import { TodayCard } from './TodayCard'
import './LiveCards.css'

export function LiveCards({ data, rows }: { data: LiveNow; rows: Row[] }) {
  const today = data.today && data.today.visitors > 0 ? data.today : null
  const pages = topPages(rows)
  const places = placesOf(rows)
  if (!today && pages.length === 0 && !places) return null
  return (
    <div className="lv-cards">
      {today && <TodayCard today={today} />}
      {pages.length > 0 && <PagesCard pages={pages} />}
      {places && <CountryCard places={places} />}
    </div>
  )
}
