// The half hour, drawn as bars or as a line over the same minutes: both stay in the page and crossfade, and each minute opens in the numbers.
import { openMinute } from '../../features/live/switchView'
import { useState } from 'react'
import type { ChartMode } from './chartMode'
import { copy } from './copy'
import { LiveLineChart } from './LiveLineChart'

interface Props {
  bars: { h: number; z: boolean }[]
  mode: ChartMode
  total: number
  beat: number
  /** The minute the chart ends on: when it moves on, the bars slide one place left. */
  minute: number
  /** A thumb taps the minute; it is no target to tab to. */
  phone: boolean
  timezone: string
  /** The clock time of the minute that many minutes ago. */
  label: (ago: number) => string
}

export function MinuteChart({ bars, mode, total, beat, minute, phone, timezone, label }: Props) {
  const [first] = useState(minute)
  const hit = (i: number) => {
    const ago = bars.length - 1 - i
    return {
      role: phone ? undefined : 'button',
      tabIndex: phone ? undefined : 0,
      title: copy.openMinute(label(ago)),
      'aria-label': copy.openMinute(label(ago)),
      onClick: () => void openMinute(ago, timezone),
      onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && void openMinute(ago, timezone),
    }
  }
  const on = (m: ChartMode) => (mode === m ? {} : { 'aria-hidden': true, inert: true })
  return (
    <div key={minute} className={minute === first ? 'lchart' : 'lchart shift'} data-mode={mode}>
      <div className="mins" role="group" aria-label={copy.minsLabel(total)} {...on('bars')}>
        {bars.map((b, i) => (
          <i key={i} className={b.z ? 'z' : ''} style={{ height: `${b.h}%` }} {...hit(i)} />
        ))}
      </div>
      <div className="mline" role="group" aria-label={copy.minsLabel(total)} {...on('line')}>
        <LiveLineChart heights={bars.map((b) => b.h)} beat={beat} hits={bars.map((b, i) => <i key={i} className={b.z ? 'z' : ''} {...hit(i)} />)} />
      </div>
    </div>
  )
}
