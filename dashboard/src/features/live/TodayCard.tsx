// Today so far: the visitors the site's day has had, how that stands against
// the same time last week, and the two days' running totals as two lines.
import { CalendarDays } from 'lucide-react'
import { fmtInt } from '../../lib/format'
import type { NowToday } from './api'
import { cardsCopy as t } from './cardsCopy'
import { linePoints, moveOf } from './cardsModel'
import { openToday } from './cardsOpen'
import { LiveCard } from './LiveCard'

const W = 300
const H = 44

function Pill({ now, before, compare }: { now: number; before: number; compare: boolean }) {
  const m = moveOf(now, before, compare)
  if (!m) return null
  const mark = { up: t.up, down: t.down, flat: t.flat }[m.dir]
  return <span className={`lv-pill num ${m.dir}`}>{m.dir === 'flat' ? mark : `${mark} ${m.pct}%`}</span>
}

function Lines({ today }: { today: NowToday }) {
  const max = Math.max(...today.hours, ...today.last, 1)
  const now = linePoints(today.hours, max, W, H, 23)
  const was = linePoints(today.last, max, W, H)
  const area = now ? `0,${H} ${now} ${(((today.hours.length - 1) / 23) * W).toFixed(1)},${H}` : ''
  return (
    <svg className="lv-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t.chart(today.visitors, today.before)}>
      {area && <polygon className="lv-area" points={area} />}
      {was && <polyline className="lv-was" points={was} />}
      {now && <polyline className="lv-now" points={now} />}
    </svg>
  )
}

export function TodayCard({ today }: { today: NowToday }) {
  return (
    <LiveCard title={t.todayTitle} icon={<CalendarDays size={15} strokeWidth={1.8} aria-hidden="true" />} onOpen={() => void openToday()}>
      <div className="lv-big">
        <span className="lv-n num">{fmtInt(today.visitors)}</span>
        <Pill now={today.visitors} before={today.before} compare={today.compare} />
      </div>
      <Lines today={today} />
      <p className="lv-sub faint">
        <span className="lv-key now" aria-hidden="true" /> {t.today} · <span className="lv-key was" aria-hidden="true" /> {t.lastWeek}
        {today.compare && <span className="lv-vs"> · {t.vsLastWeek}</span>}
      </p>
    </LiveCard>
  )
}
