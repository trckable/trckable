// What happened since the last visit, for the headline: asked of the server
// once the page is quiet (moments/useOneThing), and told once, so tomorrow's
// line is a new one. `prev` is the day before today's visit that the person
// was last here; without one the window is the last week.
import { useEffect, useState } from 'react'
import type { Site } from '../../lib/api'
import { todayIn } from '../../lib/dates'
import { markShown, toldLately, visitOf } from '../moments/visit'
import { useOneThing, type Today } from '../moments/useOneThing'

export function useSince(site: Site): { found: Today | null; prev?: string } {
  const today = todayIn(site.timezone)
  const [seen] = useState(() => visitOf(site.id, today))
  const found = useOneThing(site.id, seen.prev, today, toldLately(seen, today))
  const items = found?.items
  useEffect(() => {
    if (items?.length) markShown(site.id, today, items.map((p) => p.id))
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps -- once the findings are in
  return { found, prev: seen.prev }
}
