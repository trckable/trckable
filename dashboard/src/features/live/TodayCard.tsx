// Today so far: the visitors the site's day has had, how that stands against
// the same time last week, and the two days' running totals as two lines.
import { CalendarDays } from 'lucide-react'
import { MetricArea, type Tone } from '../../kit'
import { fmtInt } from '../../lib/format'
import type { NowToday } from './api'
import { cardsCopy as t } from './cardsCopy'
import { moveOf } from './cardsModel'
import { openToday } from './cardsOpen'

const TONE: Record<'up' | 'down' | 'flat', Tone> = { up: 'good', down: 'bad', flat: 'neutral' }

export function TodayCard({ today }: { today: NowToday }) {
  const m = moveOf(today.visitors, today.before, today.compare)
  const mark = m && { up: t.up, down: t.down, flat: t.flat }[m.dir]
  return (
    <MetricArea
      stretch
      className="lv-card"
      icon={<CalendarDays size={15} strokeWidth={1.8} />}
      label={t.todayTitle}
      status={m && m.dir !== 'flat' ? t.vsLastWeek : t.today}
      openLabel={t.open(t.todayTitle)}
      onOpen={() => void openToday()}
      value={fmtInt(today.visitors)}
      pill={m && { text: m.dir === 'flat' ? mark : `${mark} ${m.pct}%`, tone: TONE[m.dir] }}
      series={today.hours}
      was={today.last}
      slots={24}
      color="var(--accent)"
      sub={<span className="sr" role="img" aria-label={t.chart(today.visitors, today.before)} />}
    />
  )
}
