// "Here's why": the card a marker opens, with the numbers and one action. The
// click has already applied its filter; this says what it is (the same card as
// the one on opening: its kind, when, the figure, the chart of the moment).
// Markers that landed together are listed under it (ClusterList), each a button that
// moves the card (and the filter) to it. Two actions: "See it" (the chart comes
// into view with the moment's day lit) and, the one that matters, Share.
import type { Point } from '../../lib/api'
import { ClusterList } from './ClusterList'
import { copy } from './copy'
import { focusMoment } from './focus'
import { openMark } from './open'
import { PinCard } from './PinCard'

export function WhyCard({ open, site, series, money, onShare, onPick }: { open: NonNullable<ReturnType<typeof openMark.get>>; site: { id: string; timezone: string }; series: readonly Point[]; money: (minor: number) => string; onShare?: () => void; onPick: (at: number) => void }) {
  const close = () => openMark.set(null)
  return (
    <PinCard
      id="moment-why"
      asked
      closeLabel={copy.close}
      pin={open.pins[open.at]}
      site={site}
      series={series}
      money={money}
      onClose={close}
      actions={
        <>
          <button type="button" className="btn ghost" onClick={() => focusMoment(open.pins[open.at])}>
            {copy.today.see}
          </button>
          {onShare ? (
            <button type="button" className="btn primary" onClick={onShare}>
              {copy.share}
            </button>
          ) : (
            <button type="button" className="btn" onClick={close}>
              {copy.close}
            </button>
          )}
        </>
      }
      extra={open.pins.length > 1 && <ClusterList key={open.pins[0].id} pins={open.pins} at={open.at} money={money} onPick={onPick} />}
    />
  )
}
