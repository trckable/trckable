// The day in 24 hours: a strip of cells, each as warm as its hour was busy.
import { fmtInt } from '../../lib/format'
import { copy } from './copy'

export function HourStrip({ hours }: { hours: number[] }) {
  const top = Math.max(1, ...hours)
  return (
    <div className="cal-strip" role="img" aria-label={copy.byHour}>
      {hours.map((n, h) => (
        <i key={h} style={{ ['--h' as string]: n / top }} title={copy.hour(String(h).padStart(2, '0') + ':00', fmtInt(n))} />
      ))}
    </div>
  )
}
