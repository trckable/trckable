// The story's four tiles: a number and one line saying where it stands.
import { copy } from './copy'
import type { Tile } from './rules'

export function Tiles({ tiles, onConnect }: { tiles: Tile[]; onConnect: () => void }) {
  return (
    <section className="sv-tiles" aria-label={copy.tilesLabel}>
      {tiles.map((t) => (
        <div key={t.key} className={t.connect ? 'sv-tile dim' : 'sv-tile'}>
          <span className="sv-tile-name">{t.label}</span>
          <span className={`sv-tile-value num ${t.connect ? 'off' : t.tone}`}>{t.value}</span>
          {t.connect ? (
            <button type="button" className="sv-link" onClick={onConnect}>
              {t.verdict} →
            </button>
          ) : (
            <span className={`sv-tile-verdict ${t.tone}`}>{t.verdict}</span>
          )}
        </div>
      ))}
    </section>
  )
}
