// The guide cards, one a day at most: the first AI visitor or crawler (any
// age of site), and in a site's first seven days Replay, Full, the weekly
// email and Search Console, for an owner. Never for what is already used or
// set up, and a card put away or acted on does not come back (firstWeek.ts).
// The weekly email's words and switch are the first screen's own.
import { Bot, EyeOff, Mail, Maximize2, Play, Search, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { SideCard } from '../../components/SideCard/SideCard'
import { cardModal } from '../../components/CardModal/copy'
import type { Point, Site } from '../../lib/api'
import { more } from '../../lib/apiMore'
import { setView } from '../../lib/url'
import AiModal from '../aisearch/AiModal'
import { guideCopy } from '../aisearch/copy'
import { useAiSeen, type AiSeen } from '../aisearch/useAiSeen'
import { useCrawlersOff } from '../aisearch/useCrawlersOff'
import { openTab, rememberTab } from '../cards/TabCard'
import { choose, canLeaveOut, stateOf } from '../exclude/ownVisits'
import { openSettings } from '../../lib/settings'
import { first } from '../install/firstCopy'
import { wasSeen } from '../install/seen'
import { useWeeklyEmail } from '../install/useWeeklyEmail'
import { copy } from './copy'
import DiscoverModal from './DiscoverModal'
import { keptOf, pick, remember, trafficDay, type CardId } from './firstWeek'
import { wasUsed } from './store'


/** What each card is: its icon and its own colour. */
const KIND: Record<CardId, { Icon: LucideIcon; tint: string }> = {
  exclude: { Icon: EyeOff, tint: 'var(--ch-2)' },
  ai: { Icon: Bot, tint: 'var(--ch-6)' },
  crawlers: { Icon: Bot, tint: 'var(--ch-3)' },
  replay: { Icon: Play, tint: 'var(--ch-7)' },
  full: { Icon: Maximize2, tint: 'var(--accent)' },
  weekly: { Icon: Mail, tint: 'var(--ch-5)' },
  search: { Icon: Search, tint: 'var(--ch-1)' },
}

/** Presses Replay where it is: the card has no state of the chart's to start it with. */
const playReplay = () => document.querySelector<HTMLButtonElement>('.replay-btn')?.click()

/** What a card says: the weekly email's words are the first screen's own, and the AI one depends on which came first. */
function textOf(id: CardId, ai: AiSeen | null | undefined) {
  if (id === 'weekly') return first.cards.weekly
  if (id === 'ai') return guideCopy[ai ?? 'visitor']
  return copy.discover[id]
}

/** Brings the AI & Search tab into view: the card's one action. Compact has no such tab, so it opens in Full, on that tab. */
const openAiSearch = (site: Site) => {
  rememberTab(site.id, 'who', 'ai-search')
  setView({ mode: 'full' })
  openTab('who', 'ai-search')
  setTimeout(() => document.getElementById('cards')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
}

/** `fresh`: the site is in its first week, so the getting-started cards are in play too. */
export function Discover({ site, today, fresh, series, onAway }: { site: Site; today: string; fresh: boolean; series: readonly Point[]; onAway: () => void }) {
  const [open, setOpen] = useState(false)
  const weekly = useWeeklyEmail(site, fresh)
  const [search, setSearch] = useState<boolean | null>(null)
  const [firstDay] = useState(() => trafficDay(site.id, today)) // before kept is read: it writes the day into it
  const [kept, setKept] = useState(() => keptOf(site.id))
  const aiSeen = useAiSeen(site.id, !kept.done.includes('ai') || !kept.done.includes('crawlers')) // asked no more once both AI cards are put away
  useEffect(() => {
    if (!fresh) return
    let live = true
    more
      .searchConsole(site.id)
      .then((r) => live && setSearch(r.connected))
      .catch(() => live && setSearch(true)) // on error assume it is set up: never nag on a guess
    return () => {
      live = false
    }
  }, [site.id, fresh])
  const crawlersOff = useCrawlersOff(site.id, aiSeen === 'visitor' && !kept.done.includes('crawlers'))
  const ready = weekly.ready && (search !== null || !fresh) && aiSeen !== undefined && crawlersOff !== undefined
  const id = useMemo(
    () => (ready ? pick({ replayed: wasUsed('replay'), fullOpened: wasUsed('full'), weekly: weekly.on || wasSeen('weekly', site.id), search: search === true, exclude: fresh && firstDay === today && canLeaveOut(site) && stateOf(site) !== 'excluded', ai: !!aiSeen, crawlers: crawlersOff, fresh }, kept, today) : null),
    [ready, weekly.on, search, kept, today, site, firstDay, aiSeen, crawlersOff, fresh],
  )
  // Today's pick is remembered, so a reload shows the same card and no other.
  useEffect(() => {
    if (id) remember(site.id, { ...kept, day: today, id })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps -- kept only changes together with id
  if (!id) return null
  const away = () => {
    const next = { ...kept, done: [...kept.done, id], day: today, id }
    remember(site.id, next)
    setKept(next)
    onAway()
  }
  const t = textOf(id, aiSeen)
  const { Icon } = KIND[id]
  const go: Record<CardId, () => void> = {
    exclude: () => {
      away()
      choose(site, 'ignore')
    },
    replay: () => {
      away()
      playReplay()
    },
    ai: () => {
      away()
      openAiSearch(site)
    },
    crawlers: () => {
      away()
      void import('../aisearch/turnOnCrawlers').then((m) => m.default(site))
    },
    full: () => {
      away()
      setView({ mode: 'full' })
    },
    weekly: () => weekly.toggle(away),
    search: () => {
      away()
      openSettings(site, 'search')
    },
  }
  const modal = () => {
    if (!open) return null
    // Seen is done: closing the card puts the side card away with it, so it does not stay behind.
    const shut = () => {
      setOpen(false)
      away()
    }
    if (id === 'ai') return <AiModal site={site} seen={aiSeen ?? 'visitor'} onClose={shut} onGo={go.ai} />
    return <DiscoverModal id={id} Icon={Icon} tint={KIND[id].tint} text={t} tz={site.timezone} series={series} busy={id === 'weekly' && weekly.busy} onClose={shut} onGo={go[id]} />
  }
  return (
    <>
      <SideCard
        id="discover"
        label={t.label}
        closeLabel={copy.close}
        kind={{ icon: <Icon size={14} strokeWidth={2} />, label: t.label, tint: KIND[id].tint }}
        title={t.title}
        onClose={away}
        actions={
          <button type="button" className="btn primary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            {cardModal.details}
          </button>
        }
      >
        <p className="muted why-body">{t.body}</p>
      </SideCard>
      {modal()}
    </>
  )
}
