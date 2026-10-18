// Keeps the last complete page on screen, dimmed, while the next period is still being read, and swaps once, when it
// is whole: a period change never shows a headline for one period over the numbers of another. A page seen before (the
// tab left and come back to) is shown at once as it was, and refreshed behind. With nothing seen yet, `first` (the loading
// shape) stands in until the page is whole, so it does not build up piece by piece.
import { useEffect, useState, type ReactNode } from 'react'
import { usePageLoading } from '../../lib/pageLoading'

type Kept = { id: string; node: ReactNode }

// The last whole page of each address, for the way back to a tab.
const seen = new Map<string, Kept>()
const KEEP = 8

export function Hold({ ready, id, first, children }: { ready: boolean; id: string; first: ReactNode; children: ReactNode }) {
  const [last, setLast] = useState<Kept | null>(() => seen.get(id) ?? null)
  useEffect(() => {
    if (!ready || last?.id === id) return
    const kept = { id, node: children }
    seen.delete(id)
    seen.set(id, kept)
    if (seen.size > KEEP) seen.delete(seen.keys().next().value as string)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the page that is whole is kept for the moment the next one is being read
    setLast(kept)
  }, [ready, id, last, children])
  // One wrapper whether held or not, so the page that follows is the same elements as the one it replaces: its ring, its
  // numbers and its line move from what they showed instead of being drawn anew.
  // While the first shape of the page stands in, the page is loading: the foot waits for its height.
  usePageLoading(!ready && !last)
  if (!ready && !last) return <>{first}</>
  const held = !ready && !!last
  // The same address read again is not dimmed: it is the page as it was, being refreshed.
  const stale = held && last.id === id
  return (
    <div className={held && !stale ? 'mk-held' : 'mk-hold'} aria-busy={held || undefined} inert={held}>
      {held ? last.node : children}
    </div>
  )
}
