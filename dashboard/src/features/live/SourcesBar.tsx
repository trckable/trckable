// Where the last 30 minutes came from: one bar split by channel, each in its
// own channel colour (lib/palette: the colour follows the channel, never its
// rank), the rest as one neutral part.
import { channelColor } from '../../lib/palette'
import { copy } from './copy'
import { pct, sharesOf } from './model'
import type { LiveNow } from './api'

export function SourcesBar({ sources }: { sources: LiveNow['sources'] }) {
  const { parts, other } = sharesOf(sources)
  return (
    <div className="live-sources">
      <h3 className="live-label">{copy.sources}</h3>
      {parts.length === 0 ? (
        <p className="faint live-none">{copy.noSources}</p>
      ) : (
        <>
          <div className="live-split" aria-hidden="true">
            {parts.map((p) => (
              <span key={p.channel} style={{ flexGrow: p.share, background: channelColor(p.channel) }} />
            ))}
            {other > 0 && <span className="live-other" style={{ flexGrow: other }} />}
          </div>
          <ul className="live-legend">
            {parts.map((p) => (
              <li key={p.channel}>
                <span className="live-swatch" style={{ background: channelColor(p.channel) }} aria-hidden="true" />
                {copy.sourceLabel(p.channel)}
                <b className="num">{pct(p.share)}</b>
              </li>
            ))}
            {other > 0 && (
              <li>
                <span className="live-swatch live-other" aria-hidden="true" />
                {copy.other}
                <b className="num">{pct(other)}</b>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}
