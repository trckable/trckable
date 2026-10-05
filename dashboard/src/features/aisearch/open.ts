// Brings the AI & Search tab into view. Compact has no such tab, so it opens in Full, on that tab.
import type { Site } from '../../lib/api'
import { setView } from '../../lib/url'
import { openTab, rememberTab } from '../cards/TabCard'

export const openAiSearch = (site: Site) => {
  rememberTab(site.id, 'who', 'ai-search')
  setView({ mode: 'full' })
  openTab('who', 'ai-search')
  setTimeout(() => document.getElementById('cards')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
}
