// The notes of the period on screen, for the chart's flags; and the day a
// note from the list (or from Settings, over the dashboard) asks to show.
import { useCallback, useEffect, useState } from 'react'
import { api, type Annotation } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { listenJump } from './jump'

export function useNotes(site: string, range: Range, onJump: (day: string) => void) {
  const [notes, setNotes] = useState<Annotation[]>([])
  // Which period the notes are in for: the chart may wait for them, as a
  // note before a new site's first visit moves where the chart starts.
  const key = site + range.from + range.to
  const [loadedFor, setLoadedFor] = useState('')
  const load = useCallback(() => {
    api
      .annotations(site, range.from, range.to)
      .then((r) => setNotes(r.annotations ?? []))
      .catch(() => setNotes([]))
      .finally(() => setLoadedFor(site + range.from + range.to))
  }, [site, range.from, range.to])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => listenJump(onJump), [onJump])
  return { notes, load, ready: loadedFor === key }
}
