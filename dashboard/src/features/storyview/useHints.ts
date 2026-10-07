// The lines beside the answers: heatmaps for a busy page, the first AI
// visitor or crawler, turning AI crawlers on. Each asked of the server once
// the page is quiet, put away for good once closed or acted on (what is
// remembered is moments/firstWeek's, per site, in this browser).
import { useMemo, useState } from 'react'
import type { Site } from '../../lib/api'
import { todayIn } from '../../lib/dates'
import { canChange } from '../../lib/me'
import { useAiSeen } from '../aisearch/useAiSeen'
import { useCrawlersOff } from '../aisearch/useCrawlersOff'
import { heatDone, markHeatDone, useHeatAsk } from '../heatmap/guide'
import { keptOf, remember, type CardId } from '../moments/firstWeek'
import { hintsOf, type Hint } from './rules'

export function useHints(site: Site): { hints: Hint[]; away: (h: Hint) => void } {
  const today = todayIn(site.timezone)
  const owner = canChange() && !!site.last_event_at
  const [kept, setKept] = useState(() => keptOf(site.id))
  const [heatGone, setHeatGone] = useState(() => heatDone(site.id))
  const aiWanted = owner && (!kept.done.includes('ai') || !kept.done.includes('crawlers')) // asked no more once both are put away
  const ai = useAiSeen(site.id, aiWanted)
  const crawlersOff = useCrawlersOff(site.id, owner && ai === 'visitor' && !kept.done.includes('crawlers'))
  const heat = useHeatAsk(site.id, owner && !heatGone)
  const hints = useMemo(() => hintsOf({ ai, crawlersOff, heat, owner }, kept, heatGone, today), [ai, crawlersOff, heat, owner, kept, heatGone, today])
  const away = (h: Hint) => {
    if (h.id === 'heat') {
      markHeatDone(site.id)
      setHeatGone(true)
      return
    }
    const next = { ...kept, done: [...kept.done, h.id as CardId] }
    remember(site.id, next)
    setKept(next)
  }
  return { hints, away }
}
