// Under the picture: the groups of cards with their counts, then the cards of the group, a strip that scrolls sideways.
// Each tile is the card itself as the server draws it, in the style picked.
import { cardUrl, type CardId, type Group, type Look } from './card'

export type Tile = { key: string; card: CardId; ms?: string; name: string }
export type Tab = { group: Group; name: string; tiles: Tile[] }

type Props = { site: string; look: Look; tabs: Tab[]; group: Group; onGroup: (g: Group) => void; onPick: (t: Tile) => void; label: string }

export function CardStrip({ site, look, tabs, group, onGroup, onPick, label }: Props) {
  const tiles = tabs.find((t) => t.group === group)?.tiles ?? []
  return (
    <section className="sd-strip" aria-label={label}>
      <div className="sd-tabs" role="group" aria-label={label}>
        {tabs.map((t) => (
          <button key={t.group} type="button" className="sd-chip" aria-pressed={t.group === group} onClick={() => onGroup(t.group)}>
            {t.name} <span className="sd-px">{t.tiles.length}</span>
          </button>
        ))}
      </div>
      <div className="sd-tiles" role="radiogroup" aria-label={label}>
        {tiles.map((t) => {
          const on = t.card === look.card && t.ms === look.ms
          return (
            <button key={t.key} type="button" role="radio" aria-checked={on} className="sd-tile" onClick={() => onPick(t)}>
              <img src={cardUrl(site, { ...look, card: t.card, ms: t.ms }, 'thumb')} alt="" loading="lazy" decoding="async" />
              <span>{t.name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
