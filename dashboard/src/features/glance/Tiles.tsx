// Alert, the eight tiles and the hint under them. Every one is a button that
// opens its panel; a failed report shows "Couldn't load" in each tile, with Retry.
import type { Alert } from './rules'
import { copy } from './copy'
import type { TileData } from './model'

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M4 2.5L7.5 6 4 9.5" stroke="var(--g-chev)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>
)

export function AlertBanner({ alert, onOpen }: { alert: Alert; onOpen: (e: HTMLElement) => void }) {
  return (
    <button type="button" className="g-alert" onClick={(e) => onOpen(e.currentTarget)}>
      <span className="g-alert-body">
        <span className="g-alert-icon" aria-hidden="true">!</span>
        <span>
          <b>{alert.headline}</b>
          <em>{alert.sub}</em>
        </span>
      </span>
      <span className="g-alert-cta">{copy.seeWhy}</span>
    </button>
  )
}

interface Props {
  tiles: TileData[]
  failed: boolean
  onOpen: (t: TileData, el: HTMLElement) => void
  onRetry?: () => void
}

export function Tiles({ tiles, failed, onOpen, onRetry }: Props) {
  return (
    <>
      <section className="g-tiles" aria-label={copy.tilesLabel}>
        {tiles.map((t) =>
          failed ? (
            <div key={t.key} className="g-tile g-tile-fail" role="group" aria-label={t.label}>
              <span className="g-tile-label">{t.label}</span>
              <span className="g-tile-value dim">{copy.couldNot}</span>
              <button type="button" className="g-retry" onClick={onRetry}>{copy.retry}</button>
            </div>
          ) : (
            <button key={t.key} type="button" className="g-tile" onClick={(e) => onOpen(t, e.currentTarget)}>
              <span className="g-tile-label">
                {t.label}
                <Chevron />
              </span>
              <span className={`g-tile-value ${t.tone}`}>{t.value}</span>
              <span className="g-bar" aria-hidden="true">
                {t.segs.map((s, n) => <i key={n} style={{ width: `${s.pct}%`, background: s.color }} />)}
              </span>
              <span className="g-meaning">{t.meaning}</span>
            </button>
          ),
        )}
      </section>
      <p className="g-hint">{copy.hint}</p>
    </>
  )
}

/** Skeleton blocks at the final sizes, so nothing moves when the numbers land. */
export function GlanceSkeleton() {
  return (
    <div className="g-skel" aria-busy="true" aria-label={copy.loading}>
      <div className="g-hero">
        <div className="g-left">
          <div className="g-sk" style={{ height: 30, width: 220, borderRadius: 99 }} />
          <div className="g-sk g-sk-num" />
          <div className="g-sk" style={{ height: 24, width: 320 }} />
        </div>
        <div className="g-right"><div className="g-sk g-sk-strip" /></div>
      </div>
      <div className="g-tiles">
        {Array.from({ length: 8 }, (_, n) => <div key={n} className="g-tile g-sk" />)}
      </div>
    </div>
  )
}
