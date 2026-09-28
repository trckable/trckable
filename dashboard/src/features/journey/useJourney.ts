// Fetches one visitor's journey and turns it into a story. A live visitor is
// asked again every 20 seconds, so "on the site now" and the current page
// stay true while the dialog is open.
import { useEffect, useMemo, useState } from 'react'
import { api, messageOf, type JourneyResult, type ReportQuery } from '../../lib/api'
import { buildStory, type Story } from './model'

const REFRESH_MS = 20_000

export type JourneyState = { status: 'loading' } | { status: 'failed'; error: string } | { status: 'ready'; story: Story; currency: string }

export function useJourney(site: string, visitor: string, query: ReportQuery): JourneyState {
  const [data, setData] = useState<{ result: JourneyResult; at: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    let timer = 0
    const load = () => {
      void api
        .journey(site, visitor, query)
        .then((answer) => {
          if (!live) return
          // The server names the visitor in decimal; everywhere else it is the
          // short base-36 id this was opened with.
          const result = { ...answer, journey: { ...answer.journey, visitor } }
          const at = Date.now()
          setData({ result, at })
          const story = buildStory(result, at)
          if (story.identity.live) timer = window.setTimeout(load, REFRESH_MS)
        })
        .catch((e: unknown) => live && setError(messageOf(e)))
    }
    load()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [site, visitor, query])
  const story = useMemo(() => (data ? buildStory(data.result, data.at) : null), [data])
  if (story && data) return { status: 'ready', story, currency: data.result.currency ?? 'USD' }
  if (error) return { status: 'failed', error }
  return { status: 'loading' }
}
