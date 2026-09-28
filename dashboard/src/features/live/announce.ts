import { useEffect, useRef, useState } from 'react'
import type { Visit } from '../../lib/api'
import { channelLabel } from '../../lib/palette'
import { copy } from './copy'

/** A screen reader hears about new visits at most this often. */
export const ANNOUNCE_EVERY_MS = 10_000

/**
 * Throttles what is said about new visits: the first at once, then at most
 * one sentence per interval, counting whatever arrived meanwhile.
 */
export function throttle(every: number, say: (text: string) => void) {
  let last = -Infinity
  let pending: Visit[] = []
  let t: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    t = undefined
    if (!pending.length) return
    last = Date.now()
    say(sentence(pending))
    pending = []
  }
  return {
    add(vs: Visit[]) {
      if (!vs.length) return
      pending = [...vs, ...pending]
      if (t) return
      t = setTimeout(flush, Math.max(0, last + every - Date.now()))
    },
    stop: () => clearTimeout(t),
  }
}

/** One visit by its page and source; several by how many. */
export function sentence(vs: Visit[]): string {
  if (vs.length > 1) return copy.announceMany(vs.length)
  const v = vs[0]
  const page = v.kind === 'goal' ? copy.goal(v.goal ?? '') : (v.path ?? '/')
  return copy.announce(page, channelLabel(v.channel ?? 'Direct'))
}

/** The polite live region's text for the stream's newest visits. */
export function useAnnounce(visits: (Visit & { id: number })[]) {
  const [text, setText] = useState('')
  const seen = useRef(visits[0]?.id ?? 0)
  const th = useRef<ReturnType<typeof throttle> | null>(null)
  useEffect(() => {
    const t = throttle(ANNOUNCE_EVERY_MS, setText)
    th.current = t
    return t.stop
  }, [])
  useEffect(() => {
    const fresh: Visit[] = []
    for (const v of visits) {
      if (v.id <= seen.current) break
      fresh.push(v)
    }
    if (visits[0]) seen.current = Math.max(seen.current, visits[0].id)
    th.current?.add(fresh)
  }, [visits])
  return text
}
