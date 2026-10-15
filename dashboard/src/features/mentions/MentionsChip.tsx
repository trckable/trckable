// In the chart's header: "Mentions · N" for the period on screen (nothing at 0). Pointing at it lights the
// markers on the chart; a click opens the Mentions tab of the Sources card and scrolls to it. On a phone, where that
// tab is not drawn, it opens the same list as a sheet.
import { useRef, useState } from 'react'
import { AnchoredPop } from '../../components/AnchoredPop'
import type { Site } from '../../lib/api'
import { useNarrow } from '../../lib/useNarrow'
import { openTab } from '../cards/TabCard'
import { useNow } from '../incidents/useIncidents'
import { copy } from './copy'
import { setLit } from './lit'
import MentionList from './MentionList'
import { periodFor } from './periodFor'
import { SourceMark } from './SourceMark'
import { useMentions } from './useMentions'
import './mentions.css'

export default function MentionsChip({ site, labels, from, to }: { site: Site; labels: string[]; from: string; to: string }) {
  const now = useNow()
  const got = useMentions(site.id, periodFor(labels.length ? labels : [from], now), 0, !!site.mentions)
  const narrow = useNarrow()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  if (got.state !== 'ready') return null
  const lo = Date.parse(from) / 1000 - 86400
  const hi = Date.parse(to) / 1000 + 2 * 86400
  const inPeriod = got.data.mentions.filter((m) => m.posted_at >= lo && m.posted_at <= hi)
  if (inPeriod.length === 0) return null
  const go = () => {
    if (narrow) {
      setOpen((o) => !o)
      return
    }
    // The cards are a chunk that may still be on its way: wait for them (a second at most), then switch and scroll.
    let tries = 0
    const wait = setInterval(() => {
      const cards = document.getElementById('cards')
      if (!cards && ++tries < 20) return
      clearInterval(wait)
      openTab('who', 'sources')
      setTimeout(() => {
        openTab('src', 'mentions')
        cards?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }, 50)
  }
  return (
    <>
      <button ref={btn} type="button" className="mp-chip" aria-haspopup={narrow ? 'dialog' : undefined} onPointerEnter={() => setLit(true)} onPointerLeave={() => setLit(false)} onFocus={() => setLit(true)} onBlur={() => setLit(false)} onClick={go}>
        <SourceMark source={inPeriod[0].source} />
        {copy.chipCount(inPeriod.length)}
      </button>
      {open && (
        <AnchoredPop anchor={btn} label={copy.title} onClose={() => setOpen(false)}>
          {() => <MentionList site={site} />}
        </AnchoredPop>
      )}
    </>
  )
}
