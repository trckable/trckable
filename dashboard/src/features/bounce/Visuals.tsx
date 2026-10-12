// The pictures of step 3: a page and its fold, a speed gauge, a phone or a
// screen with its source. Drawn, not photographed; every number on them is the
// guide's own.
import { Monitor, Smartphone } from 'lucide-react'
import { fmtFixed, fmtPct } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import type { BounceCause } from '../../lib/apiMore'
import { SourceMark } from '../../components/visitor/SourceMark'
import { copy } from './b'

/** Google's limits for the main content: good up to 2.5 s, poor past 4 s. */
const GOOD_S = 2.5
const POOR_S = 4
const SCALE_S = 6

export function PageFrame({ c }: { c: BounceCause }) {
  return (
    <div className="bg-vis">
      <div className="bg-frame" aria-hidden="true">
        <div className="bg-bar-top">
          <i />
          <i />
          <i />
          <span className="bg-addr">{c.label}</span>
        </div>
        <div className="bg-body">
          <b />
          <u />
          <u className="short" />
          <div className="bg-fold">
            <span />
          </div>
          <u />
          <u className="short" />
        </div>
      </div>
      <p className="bg-cap">{copy.noClick(fmtPct(c.rate))}</p>
    </div>
  )
}

export function SpeedGauge({ c }: { c: BounceCause }) {
  const secs = (c.lcp_ms ?? 0) / 1000
  const pos = (s: number) => `${Math.min(100, (s / SCALE_S) * 100)}%`
  return (
    <div className="bg-vis">
      <div className="bg-gauge" role="img" aria-label={copy.showsAfter(fmtFixed(secs, 1))}>
        <span className="zone good" style={{ width: pos(GOOD_S) }} />
        <span className="zone slow" style={{ width: `calc(${pos(POOR_S)} - ${pos(GOOD_S)})` }} />
        <span className="zone poor" style={{ width: `calc(100% - ${pos(POOR_S)})` }} />
        <span className="needle" style={{ left: pos(secs) }}>
          <b>{copy.secs(fmtFixed(secs, 1))}</b>
        </span>
      </div>
      <div className="bg-zones" aria-hidden="true">
        <span>{copy.zones.good}</span>
        <span>{copy.zones.slow}</span>
        <span>{copy.zones.poor}</span>
      </div>
      <p className="bg-cap">{copy.showsAfter(fmtFixed(secs, 1))}</p>
    </div>
  )
}

export function Handset({ c }: { c: BounceCause }) {
  const phone = c.device !== 'Desktop'
  const Frame = phone ? Smartphone : Monitor
  return (
    <div className="bg-vis">
      <div className={phone ? 'bg-device phone' : 'bg-device desk'} aria-hidden="true">
        <SourceMark channel={c.source ?? ''} size={30} />
        <Frame size={18} strokeWidth={1.6} />
      </div>
      <p className="bg-cap">{copy.fromOn(channelLabel(c.source ?? ''), c.device ?? '')}</p>
    </div>
  )
}
