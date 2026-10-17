// What a screen reader hears about the stream's new visits: one polite line, at most once in ten seconds.
import type { Visit } from '../../lib/api'
import { useAnnounce } from '../../features/live/announce'

export function Announce({ visits }: { visits: (Visit & { id: number })[] }) {
  const said = useAnnounce(visits)
  return (
    <p className="sr" aria-live="polite" aria-atomic="true">
      {said}
    </p>
  )
}
