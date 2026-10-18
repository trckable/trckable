// A source's small mark: Hacker News and Product Hunt in their own letter and
// colour, the news as a newspaper. Decorative: the name always sits beside it.
import { Link2, Newspaper } from 'lucide-react'
import type { Source } from './api'
import './mentions.css'

const LETTER: Record<Source, string> = { hn: 'Y', ph: 'P', news: '', ref: '' }

function Glyph({ source }: { source: Source }) {
  if (source === 'news') return <Newspaper size={13} strokeWidth={2} />
  if (source === 'ref') return <Link2 size={13} strokeWidth={2} />
  return <>{LETTER[source]}</>
}

export function SourceMark({ source }: { source: Source }) {
  return (
    <span className="mention-mark" data-source={source} aria-hidden="true">
      <Glyph source={source} />
    </span>
  )
}
