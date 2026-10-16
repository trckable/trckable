// Keeps the last complete page on screen, dimmed, while the next period is still being read, and swaps once, when it
// is whole: a period change never shows a headline for one period over the numbers of another.
import { useEffect, useState, type ReactNode } from 'react'

export function Hold({ ready, id, children }: { ready: boolean; id: string; children: ReactNode }) {
  const [last, setLast] = useState<{ id: string; node: ReactNode } | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the page that is whole is kept for the moment the next one is being read
    if (ready && last?.id !== id) setLast({ id, node: children })
  }, [ready, id, last, children])
  if (ready || !last) return <>{children}</>
  return (
    <div className="mk-held" aria-busy="true" inert>
      {last.node}
    </div>
  )
}
