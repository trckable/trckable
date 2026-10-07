// One line beside an answer: what was noticed, one button to act on it, and
// a way to put it away for good.
import { X } from 'lucide-react'
import type { Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { setView } from '../../lib/url'
import { guideCopy } from '../aisearch/copy'
import { openTab, rememberTab } from '../cards/TabCard'
import { heatCopy } from '../heatmap/copy'
import { copy as moments } from '../moments/copy'
import type { Hint } from './rules'

/** Brings the AI & Search tab into view; Compact has no such tab, so it opens in Full, on that tab. */
const openAiSearch = (site: Site) => {
  rememberTab(site.id, 'who', 'ai-search')
  setView({ mode: 'full' })
  openTab('who', 'ai-search')
  setTimeout(() => document.getElementById('cards')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
}

function textOf(h: Hint): { line: string; go: string } {
  if (h.id === 'heat') return { line: heatCopy.card.title(h.path ?? '', h.views ?? 0), go: heatCopy.card.go }
  if (h.id === 'crawlers') return { line: moments.discover.crawlers.title, go: moments.discover.crawlers.go }
  const t = guideCopy[h.ai ?? 'visitor']
  return { line: t.title, go: t.go }
}

export function HintLine({ site, hint, onAway }: { site: Site; hint: Hint; onAway: () => void }) {
  const t = textOf(hint)
  const go = () => {
    onAway()
    if (hint.id === 'heat') openSettings(site, 'modules')
    else if (hint.id === 'ai') openAiSearch(site)
    else void import('../aisearch/turnOnCrawlers').then((m) => m.default(site))
  }
  return (
    <div className="sv-hint">
      <span>{t.line}</span>
      <button type="button" className="sv-link" onClick={go}>
        {t.go}
      </button>
      <button type="button" className="sv-hint-x" aria-label={moments.close} onClick={onAway}>
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  )
}
