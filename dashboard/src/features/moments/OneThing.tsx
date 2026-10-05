// One thing today: on opening the Data view, a card with the most important
// thing since the last visit; ← → turn to the second and third (dots say where,
// the next peeks out behind). Its action applies the pin's filter (and day)
// through the address, the way a marker does, and always shows something: the
// card leaves, a toast says what is on screen ("Showing google.com · Sep 27")
// with Clear, the chart comes into view and the marker lights up. Put away, it
// stays away for the day.
import { useState } from 'react'
import { cardModal } from '../../components/CardModal/copy'
import { toast } from '../../components/Toast'
import type { Point, Site } from '../../lib/api'
import { chartBucket, patchFor } from './apply'
import { rangeOf } from '../../lib/dashQuery'
import { todayIn } from '../../lib/dates'
import { sameFilter } from '../../lib/filterSet'
import { readView, setView } from '../../lib/url'
import { copy } from './copy'
import { showing } from './figure'
import { focusMoment } from './focus'
import { PinCard } from './PinCard'
import PinModal from './PinModal'
import type { Pin } from './pins'
import type { Today } from './useOneThing'


/** Takes the pin's filters (and the day it picked) off the address again. */
function clearPin(pin: Pin) {
  const view = readView(new URLSearchParams(location.search))
  setView({ filters: view.filters.filter((f) => !pin.filters.some((m) => sameFilter(m, f))), day: pin.showDay ? undefined : view.day })
}

/** What "See it" does: the address, a word about it, and the chart in view with the marker lit. */
export function seeIt(pin: Pin, site: Pick<Site, 'timezone'>) {
  const view = readView(new URLSearchParams(location.search))
  const today = todayIn(site.timezone)
  const range = rangeOf(view, today)
  setView(patchFor(pin, { filters: view.filters, range, today, bucket: chartBucket(view, range) }))
  toast(showing(pin), 'info', { label: copy.clear, run: () => clearPin(pin) })
  focusMoment(pin)
}

export function OneThing({ site, found, series, onAway }: { site: Site; found: Today; since?: string; series: readonly Point[]; onAway: () => void }) {
  const [at, setAt] = useState(0)
  const [open, setOpen] = useState(false)
  const { items } = found
  const t = copy.today
  const pin = items[at]
  return (
    <>
      <PinCard
        id="one-thing"
        label={t.label}
        closeLabel={copy.close}
        pin={pin}
        site={site}
        series={series}
        money={found.money}
        onClose={onAway}
        deck={{ index: at, count: items.length, onNext: () => setAt(at + 1), onPrev: () => setAt(at - 1), prevLabel: t.previous, nextLabel: t.next, position: t.of(at + 1, items.length) }}
        actions={
          <button type="button" className="btn primary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            {cardModal.details}
          </button>
        }
      />
      {open && (
        <PinModal
          pin={pin}
          site={site}
          series={series}
          money={found.money}
          onClose={() => setOpen(false)}
          onSee={() => {
            onAway()
            seeIt(pin, site)
          }}
        />
      )}
    </>
  )
}
