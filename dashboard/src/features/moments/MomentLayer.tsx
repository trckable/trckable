// The moments on the main chart: a small marker on the line at each, at most
// six, the most important first, with the same words as the card on opening.
// Pointing at or focusing one says it in a line; a click applies its filter
// (and its day) through the address and opens the card with the numbers. Each
// is a button in the page's tab order and has a shape of its own, so none
// depends on colour. It also brings the card the Data view says on its own
// (Ambient). In the chart extras' chunk, fetched when the chart is first drawn.
import { Bot, Coins, Flag, Sparkles, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import type { Bucket, ReportQuery, Site } from '../../lib/api'
import { fmtDay, todayIn } from '../../lib/dates'
import { readView, setView } from '../../lib/url'
import { rangeOf } from '../../lib/dashQuery'
import { patchFor } from './apply'
import Ambient from './Ambient'
import { copy } from './copy'
import { pickMarks, placePins, type ChartGeo, type Mark } from './marks'
import { openMark } from './open'
import type { Pin, PinKind } from './pins'
import { useMoments } from './useMoments'
import { say } from './words'
import { WhyCard } from './WhyCard'
import './moments.css'

const TIP_W = 290
const ICON: Partial<Record<PinKind, LucideIcon>> = { spike: TrendingUp, sale: Coins, referrer: Sparkles, drop: TrendingDown, milestone: Flag, ai: Bot }

export interface LayerProps {
  g: ChartGeo
  site: Site
  query: ReportQuery
  labels: string[]
  bucket: Bucket
  /** Writes an amount in the site's currency (a sale is only a moment where the reader sees revenue: the server leaves it out otherwise). */
  money: (minor: number) => string
  onShare?: () => void
}

export default function MomentLayer(p: LayerProps) {
  const { g } = p
  const pins = useMoments(p.site.id, p.query, p.bucket)
  const fmt = p.money
  const [shown, setShown] = useState<number | null>(null)
  const id = useId()
  const current = openMark.use()
  // The card belongs to the chart it was opened on: when the chart goes (another site, Replay), so does it.
  useEffect(() => () => openMark.set(null), [])
  const placed = useMemo(() => placePins(pins ?? [], p.labels, p.bucket), [pins, p.labels, p.bucket])
  const marks = useMemo(() => pickMarks(placed, g.x), [placed, g.w, p.labels.length]) // eslint-disable-line react-hooks/exhaustive-deps -- g.x changes with the width and the number of buckets, which are listed
  /** Applies a pin to the address; `drop` is the pin it replaces, whose filter goes. */
  const apply = (pin: Pin, drop?: Pin) => {
    const view = readView(new URLSearchParams(location.search))
    const today = todayIn(p.site.timezone)
    const filters = view.filters.filter((f) => !drop?.filters.some((d) => d.dim === f.dim && d.value === f.value))
    setView(patchFor(pin, { filters, range: rangeOf(view, today), today, bucket: p.bucket }))
  }
  const click = (m: Mark) => {
    apply(m.pin)
    openMark.set({ pins: [m.pin, ...m.more], at: 0 })
  }
  const tip = marks.find((m) => m.i === shown)
  return (
    <>
      <Ambient site={p.site} />
      <div role="group" aria-label={copy.moments} className="moment-marks">
        {marks.map((m) => {
          const Icon = ICON[m.pin.kind] ?? Flag
          const line = say(m.pin, fmt).line
          return (
            <button
              key={m.pin.id}
              type="button"
              className={`moment-mark ${m.pin.kind}${current?.pins[0].id === m.pin.id ? ' on' : ''}`}
              style={{ left: g.x(m.i), top: g.y(g.vals[m.i] ?? 0) }}
              aria-label={copy.marker(fmtDay(m.pin.day ?? ''), line, m.more.length)}
              aria-describedby={shown === m.i ? id : undefined}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerEnter={() => setShown(m.i)}
              onPointerLeave={() => setShown(null)}
              onFocus={() => setShown(m.i)}
              onBlur={() => setShown(null)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return
                setShown(null)
                openMark.set(null)
              }}
              onClick={() => click(m)}
            >
              <Icon size={11} strokeWidth={2.25} aria-hidden="true" />
              {m.more.length > 0 && <i className="moment-n num" aria-hidden="true">{m.more.length + 1}</i>}
            </button>
          )
        })}
      </div>
      {current && (
        <WhyCard
          open={current}
          money={fmt}
          onShare={p.onShare}
          onPick={(at) => {
            apply(current.pins[at], current.pins[current.at])
            openMark.set({ pins: current.pins, at })
          }}
        />
      )}
      {tip && (
        <div id={id} role="tooltip" className="moment-tip" style={{ left: Math.max(4, Math.min(g.x(tip.i) - TIP_W / 2, g.w - TIP_W - 4)), top: g.y(g.vals[tip.i] ?? 0) - 16, maxWidth: TIP_W }}>
          {say(tip.pin, fmt).line}
          {tip.more.length > 0 && <span className="faint"> · {copy.more(tip.more.length)}</span>}
        </div>
      )}
    </>
  )
}
