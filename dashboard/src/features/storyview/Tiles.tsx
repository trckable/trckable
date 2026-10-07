// The story's four tiles, on the card kit: a number, the move as a pill and one
// line saying where it stands. Visitors draws its days behind the number; with
// no revenue counted the fourth is a progress card with a Connect chip.
import { kitWords, MetricArea, Progress, type Tone as KitTone } from '../../kit'
import { copy } from './copy'
import type { Tile, Tone } from './rules'

const KIT: Record<Tone, KitTone> = { good: 'good', warn: 'warn', bad: 'bad', flat: 'neutral' }

function pillOf(t: Tile) {
  if (!t.move || t.move.arrow === '→') return null
  return { text: `${t.move.arrow === '↑' ? kitWords.up : kitWords.down} ${t.move.pct}%`, tone: KIT[t.move.tone] }
}

export function Tiles({ tiles, series, onConnect }: { tiles: Tile[]; series: number[]; onConnect: () => void }) {
  return (
    <section className="sv-tiles" aria-label={copy.tilesLabel}>
      {tiles.map((t) =>
        t.connect ? (
          <Progress key={t.key} className="sv-tile dim" title={t.label} value={t.value} actions={[{ key: 'connect', label: copy.connectChip, onClick: onConnect }]} />
        ) : (
          <MetricArea key={t.key} className="sv-tile" label={t.label} value={t.value} pill={pillOf(t)} sub={t.verdict} tone={KIT[t.tone]} series={t.key === 'visitors' ? series : null} />
        ),
      )}
    </section>
  )
}
