// What a tile tells a listener when it is asked about: its name, the number
// shown, how it moved and the verdict under it. Plain text from the tile itself.
import type { AboutThis } from '../../components/Ask'
import { copy } from './copy'
import type { Tile } from './rules'

export function aboutTile(t: Tile): AboutThis {
  const facts = [`${t.label}: ${t.value}`]
  if (t.move && t.move.arrow !== '→') facts.push(copy.aboutMove(t.move.arrow === '↑' ? copy.aboutUp : copy.aboutDown, t.move.capped ? '10x+' : `${String(t.move.pct)}%`))
  if (t.verdict) facts.push(t.verdict)
  return { title: t.label, facts, question: copy.aboutTile(t.label) }
}
