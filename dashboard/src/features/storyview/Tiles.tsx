// The story's four tiles, on the card kit: a number, the move as a pill and one
// line saying where it stands. Visitors draws its days behind the number; with
// no revenue counted the fourth is a progress card with a Connect chip.
import { Clock, LogOut, Users, Wallet, type LucideIcon } from 'lucide-react'
import { ShortName } from '../../kit/ShortName'
import { Card, kitWords, MetricArea, TipText, type Tone as KitTone } from '../../kit'
import { copy } from './copy'
import { brief, type Tile, type Tone } from './rules'
import type { TileSeries } from './tileSeries'

const ICON: Record<Tile['key'], LucideIcon> = { visitors: Users, bounce: LogOut, session: Clock, revenue: Wallet }

/** Each number draws in its own colour from the chart tokens. */
const COLOR: Record<Tile['key'], string> = { visitors: 'var(--accent)', bounce: 'var(--ch-1)', session: 'var(--ch-7)', revenue: 'var(--money)' }

/** Bounce rate and Session time are "Bounce" and "Session" on a phone. */
function nameOf(t: Tile) {
  const short = { bounce: kitWords.shortBounce, session: kitWords.shortSession }[t.key as 'bounce' | 'session']
  return short ? <ShortName full={t.label} short={short} /> : t.label
}

const KIT: Record<Tone, KitTone> = { good: 'good', warn: 'warn', bad: 'bad', flat: 'neutral' }

function pillOf(t: Tile) {
  if (!t.move) return null
  if (t.move.arrow === '→') return { text: kitWords.flat, tone: 'neutral' as const }
  return { text: `${t.move.arrow === '↑' ? kitWords.up : kitWords.down} ${t.move.capped ? copy.tenTimesShort : `${t.move.pct}%`}`, tone: KIT[t.move.tone] }
}

/** The verdict on a tile's top line; with a real comparison behind it, a tap says what "normal" is. */
function Status({ t }: { t: Tile }) {
  const text = brief(t.verdict)
  if (t.verdict === copy.noBefore || t.verdict === copy.tooFew) return <span title={t.verdict}>{text}</span>
  return <TipText text={text} tip={`${t.verdict}. ${copy.normalTip}`} align="right" />
}

export function Tiles({ tiles, series, onConnect }: { tiles: Tile[]; series: TileSeries; onConnect: () => void }) {
  return (
    <section className="sv-tiles" aria-label={copy.tilesLabel}>
      {tiles.map((t) => {
        const Icon = ICON[t.key]
        const icon = <Icon size={15} strokeWidth={1.8} />
        return t.connect ? (
          <Card key={t.key} variant="dashed" className="sv-tile" icon={icon} title={t.label}>
            <button type="button" className="kit-linkline" onClick={onConnect}>
              {copy.connectChip} →
            </button>
          </Card>
        ) : (
          <MetricArea key={t.key} className="sv-tile" icon={icon} label={nameOf(t)} value={t.value} pill={pillOf(t)} status={<Status t={t} />} tone={KIT[t.tone]} color={COLOR[t.key]} series={series[t.key]} />
        )
      })}
    </section>
  )
}
