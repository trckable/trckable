// Live while its first answer is on the way: the page's own boxes (the same classes, so the same sizes and places), the
// words that are already known written out, and a quiet shimmer where the numbers will be. Nothing moves when they land.
import { copy } from '../live/copy'

const BARS = 30
const bone = (w: number | string, h: number) => <i className="skl" style={{ width: w, height: h }} />

export function LiveSkeleton() {
  return (
    <div className="liveview" role="region" aria-label={copy.live} aria-busy="true">
      <section className="mk-card lnow">
        <div className="lhead">
          <span className="mk-pulse off" />
          <span className="lt">{copy.live}</span>
        </div>
        <div className="lfig">
          <div>
            <span className="ll">{copy.onlineNow}</span>
            {bone(72, 48)}
          </div>
          <div>
            <span className="ll">{copy.visitors30}</span>
            {bone(88, 48)}
          </div>
        </div>
        <div className="mins" aria-hidden="true">
          {Array.from({ length: BARS }, (_, i) => (
            <i key={i} className="skl" style={{ height: `${28 + ((i * 37) % 50)}%`, margin: 0 }} />
          ))}
        </div>
        <div className="minl">
          <span>{copy.ago30}</span>
          <span>{copy.nowWord}</span>
        </div>
        <div className="lbottom">
          <div className="lsrc">
            <span className="ll">{copy.topSources}</span>
            {bone('100%', 10)}
            {bone('60%', 14)}
          </div>
        </div>
      </section>
      <section className="mk-card lon">
        <div className="lhead">
          <span className="lt">{copy.onSite}</span>
        </div>
        <div style={{ padding: '12px 20px' }}>
          {[0, 1, 2, 3].map((k) => (
            <div key={k}>{bone('100%', 28)}</div>
          ))}
        </div>
      </section>
    </div>
  )
}
