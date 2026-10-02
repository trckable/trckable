// One thing today: on opening the Data view, one card with the most important
// thing since the last visit; Next steps to the second and third; See it
// applies its filter (and its day) through the address, the way the chart's
// markers do. Put away, it stays away for the day.
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { SideCard } from '../../components/SideCard/SideCard'
import type { Site } from '../../lib/api'
import { rangeOf } from '../../lib/dashQuery'
import { todayIn } from '../../lib/dates'
import { readView, setView } from '../../lib/url'
import { chartBucket, patchFor } from './apply'
import { copy } from './copy'
import { PinBody } from './PinBody'
import type { Today } from './useOneThing'
import { say } from './words'

export function OneThing({ site, found, since, onAway }: { site: Site; found: Today; since?: string; onAway: () => void }) {
  const [at, setAt] = useState(0)
  const { items } = found
  const t = copy.today
  const see = () => {
    const view = readView(new URLSearchParams(location.search))
    const today = todayIn(site.timezone)
    const range = rangeOf(view, today)
    setView(patchFor(items[at], { filters: view.filters, range, today, bucket: chartBucket(view, range) }))
  }
  return (
    <SideCard
      id="one-thing"
      label={t.label}
      closeLabel={copy.close}
      title={since ? t.sinceVisit : t.thisWeek}
      onClose={onAway}
      actions={
        <>
          {items.length > 1 && <span className="today-count faint num">{t.of(at + 1, items.length)}</span>}
          {at < items.length - 1 && (
            <button type="button" className="btn" aria-label={t.next} title={t.next} onClick={() => setAt(at + 1)}>
              <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="btn primary" onClick={see}>
            {t.see}
          </button>
        </>
      }
    >
      <PinBody kind said={say(items[at], found.money)} />
    </SideCard>
  )
}
