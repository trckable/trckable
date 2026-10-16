// The AI & Search dialog, from wherever the page speaks of it: which assistants sent people (a bar each), the pages they
// landed on and when; for the robots, which of them read the site and which pages. "See all" opens Explore on the AI channel.
// Its own chunk: nothing here is needed until somebody asks.
import { Suspense, useEffect, useState } from 'react'
import type { Site } from '../../lib/api'
import { lazyLoad } from '../../lib/lazyLoad'
import type { AiSeen } from '../../features/aisearch/useAiSeen'
import { openExplore } from '../explore/open'

const AiModal = lazyLoad(() => import('../../features/aisearch/AiModal'))
const EVENT = 'trckable:ai'

/** Open the dialog (for the assistants that sent people, or for the robots that read). */
export const openAi = (seen: AiSeen = 'visitor') => window.dispatchEvent(new CustomEvent<AiSeen>(EVENT, { detail: seen }))

export function AiHost({ site }: { site: Site }) {
  const [seen, setSeen] = useState<AiSeen | null>(null)
  useEffect(() => {
    const on = (e: Event) => setSeen((e as CustomEvent<AiSeen>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  if (!seen) return null
  return (
    <Suspense fallback={null}>
      <AiModal
        site={site}
        seen={seen}
        onClose={() => setSeen(null)}
        onGo={() => {
          setSeen(null)
          openExplore(seen === 'crawler' ? 'bots' : 'sources', seen === 'crawler' ? undefined : [{ dim: 'channel', value: 'AI' }])
        }}
      />
    </Suspense>
  )
}
