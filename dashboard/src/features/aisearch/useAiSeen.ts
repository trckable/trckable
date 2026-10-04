// Whether an AI assistant has ever sent this site a visitor, or an AI crawler
// has ever read it: the moment the guide card speaks. `undefined` while it is
// asked; `null` when neither has happened (or the answer could not be read:
// a guide never speaks on a guess).
import { useEffect, useState } from 'react'
import { more } from '../../lib/apiMore'

export type AiSeen = 'visitor' | 'crawler'

function firstOf(r: { visitor: boolean; crawler: boolean }): AiSeen | null {
  if (r.visitor) return 'visitor'
  return r.crawler ? 'crawler' : null
}

export function useAiSeen(site: string, wanted = true): AiSeen | null | undefined {
  const [seen, setSeen] = useState<{ site: string; first: AiSeen | null } | null>(null)
  useEffect(() => {
    if (!wanted) return
    let live = true
    more
      .aiSeen(site)
      .then((r) => live && setSeen({ site, first: firstOf(r) }))
      .catch(() => live && setSeen({ site, first: null }))
    return () => {
      live = false
    }
  }, [site, wanted])
  if (!wanted) return null
  return seen?.site === site ? seen.first : undefined
}
