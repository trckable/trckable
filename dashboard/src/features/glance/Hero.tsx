// The top of Glance: the period pill, the people number, the verdict and the
// strip of days. Rules and numbers come in ready (model.ts).
import { PRESETS, fmtDay, fmtRange, type Range } from '../../lib/dates'
import { fmtInt } from '../../lib/format'
import { copy } from './copy'
import type { GlanceModel } from './model'

interface Props {
  m: GlanceModel
  period: string
  range: Range
  today: string
}

const dayName = (date: string) => fmtDay(date.slice(0, 10))

/** Today's partial bar is dimmed, an empty day is a stub, the best day is lit. */
function barClass(d: GlanceModel['days'][number], best?: string): string {
  if (d.partial) return 'today'
  if (d.visitors === 0) return 'zero'
  return best === d.date ? 'best' : ''
}

export function Hero({ m, period, range, today }: Props) {
  const label = PRESETS.find((p) => p.id === period)?.label ?? ''
  const periodText = [label, fmtRange(range, today)].filter(Boolean).join(' · ')
  const max = Math.max(1, ...m.days.map((d) => d.visitors))
  const last = m.days[m.days.length - 1]
  const lastPartial = !!last?.partial
  const lastText = lastPartial || !last ? copy.today : dayName(last.date)
  return (
    <section className="g-hero" aria-label={copy.section}>
      <div className="g-left">
        <div className="g-num-row">
          <span className="g-num">{fmtInt(m.visitors)}</span>
          <span className="g-unit">{copy.people}</span>
        </div>
        <div className="g-verdict">
          {m.verdict.word}
          <span> · {m.verdict.explain}</span>
        </div>
      </div>
      <div className="g-right">
        <div className="g-strip" role="img" aria-label={copy.stripLabel(periodText)}>
          {m.days.map((d, n) => {
            return <i key={`${d.date}-${n}`} className={barClass(d, m.best?.date)} style={{ height: `${Math.max(3, (d.visitors / max) * 100)}%` }} title={copy.barTitle(dayName(d.date), fmtInt(d.visitors))} />
          })}
        </div>
        <div className="g-axis" aria-hidden="true">
          <span>{m.days[0] ? dayName(m.days[0].date) : ''}</span>
          {m.best && <span>{dayName(m.best.date)} · {copy.best}</span>}
          <span>{lastText}</span>
        </div>
        {m.comparisonsFrom && <div className="g-axis g-note">{copy.comparisonsStart(fmtDay(m.comparisonsFrom))}</div>}
      </div>
    </section>
  )
}
