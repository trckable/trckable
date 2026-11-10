// The bell's list and which of it has been read by this person: one store for the badge and the menu. The list is one
// request to the server (every site the person may read, each row with its own id and true time), made once after the first
// paint and again when /now answers, when a tab is shown after a minute away and when the menu opens or is about to (never
// more than once in a minute by the first three, and never in a hidden tab). The last list is kept in this browser, so a
// bell that mounts again, or a page that has just loaded, starts with it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Site } from '../../lib/api'
import { currentScope, isShared } from '../../lib/me'
import { useV2Extras } from '../slots'
import { onNowAnswer } from '../../features/live/api'
import { visibleInterval } from '../../lib/visibleInterval'
import { useReadSet } from './readState'
import { loadFeed, readFeed, saveFeed, type FeedRow } from './feed'
import { arrange, fromFeed, fromSetup, withFeed } from './notices'

/** The least time between two reads the bell starts by itself. */
export const GAP_MS = 60_000
/** The least time between two reads when the menu is opened. */
export const OPEN_GAP_MS = 5000

/** The sites the person may read, as the effect's key. */
const keyOf = (sites: Site[]) => sites.map((s) => s.id).sort().join(',')

/** The last list read in this page, for a bell that mounts again (as long as it is the same person in the same team). */
let held: { who: string; rows: FeedRow[] } | null = null
// Only a person who is known is painted for: what was kept for another team or sign-in, or for nobody, is never shown.
const heldFor = (who: string): FeedRow[] | null => (who && held?.who === who ? held.rows : loadFeed(who))

/** What the bell has of one scope (the team, the sign-in and the sites it reads): a new scope starts with nothing drawn. */
interface Shown {
  scope: string
  rows: FeedRow[]
  loaded: boolean
  kept: boolean
}
const startOf = (scope: string, who: string): Shown => {
  const kept = heldFor(who)
  return { scope, rows: kept ?? [], loaded: !!kept, kept: !!kept }
}

export function useNotices(sites: Site[]) {
  const sitesKey = keyOf(sites)
  const who = currentScope()
  const scope = `${who}#${sitesKey}`
  // A list kept from before is drawn at once: this browser's own read marks stand in until the account's arrive. Another team or set of sites starts empty.
  const [shown, setShown] = useState(() => startOf(scope, who))
  const here = shown.scope === scope ? shown : startOf(scope, who)
  if (shown.scope !== scope) setShown(here)
  const { rows, loaded, kept } = here
  const { bell: extra, bellMore } = useV2Extras()
  const can = !isShared()
  // What the sites say of themselves (a site with no visit yet) is drawn from the sites; the rest is the server's list.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  // Nothing is drawn (no badge) until the sites are known.
  const items = useMemo(
    () => (sites.length ? withFeed(arrange([...fromFeed(rows, sites, now), ...fromSetup(sites, now)], now), extra) : []),
    [rows, sites, now, extra],
  )
  const scopeNow = useRef({ scope, who })
  const ctx = useRef({ sites })
  const last = useRef(0)
  const flight = useRef<Promise<void> | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    ctx.current = { sites }
    scopeNow.current = { scope, who }
  })
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const bellRefresh = bellMore?.refresh
  const refreshExtra = useRef(bellRefresh)
  useEffect(() => {
    refreshExtra.current = bellRefresh
  })
  const { read, mark: send, synced, sync: syncRead } = useReadSet(can)
  const tell = useRef(send)
  useEffect(() => {
    tell.current = send
  })
  const run = useCallback(async () => {
    // What the answer is for: a late answer for another team (or other sites) is never drawn or kept as this one's.
    const asked = scopeNow.current
    // A failed read keeps the list as it is: the bell is not what the page waits for.
    const got = await readFeed().catch(() => null)
    // A list that could not be read whole never replaces the one shown: a site that is down must not vanish over a failed read.
    if (!got) return
    const first = got.first && !got.partial
    // The first list a person is given: what is already behind them is read, so the deploy is not a burst of unread. The server has said it once, so it is told even when the view has moved on.
    if (first) tell.current(got.notifications.map((r) => r.id))
    if (scopeNow.current.scope !== asked.scope) return
    const { sites } = ctx.current
    const list = got.notifications.map((r) => ({ ...r, domain: sites.find((s) => s.id === r.site)?.domain }))
    if (got.partial) {
      // Only a bell with nothing yet takes it, so it is not left waiting; it is not kept.
      if (alive.current) setShown((cur) => (cur.scope === asked.scope ? { ...cur, rows: cur.rows.length ? cur.rows : list, loaded: true } : cur))
      return
    }
    held = { who: asked.who, rows: list }
    saveFeed(asked.who, list)
    if (alive.current) {
      setShown((cur) => (cur.scope === asked.scope ? { ...cur, rows: list, loaded: true } : cur))
      setNow(Math.floor(Date.now() / 1000))
    }
  }, [])
  const again = useRef<(gap?: number) => void>(() => undefined)
  const later = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Reads the lists again unless a read is on its way; one that began less than `gap` ms ago puts it off to when the gap is over (once). A hidden tab reads nothing. */
  const refresh = useCallback(
    (gap = GAP_MS, soon = false) => {
      if (!can || document.visibilityState === 'hidden') return
      syncRead()
      if (flight.current) return
      const wait = last.current + gap - Date.now()
      if (wait > 0) {
        // The menu opening (or about to) wants the list as it is: a read that came a moment ago answers it, and a second one must not land while it is open.
        if (!soon && !later.current)
          later.current = setTimeout(() => {
            later.current = undefined
            again.current(gap)
          }, wait)
        return
      }
      last.current = Date.now()
      refreshExtra.current?.()
      flight.current = run().finally(() => {
        flight.current = null
      })
    },
    [can, run, syncRead],
  )
  useEffect(() => {
    again.current = refresh
  })
  useEffect(() => () => clearTimeout(later.current), [])
  // Another team or other sites: nothing of the last scope's reads is waited for or reused, and the new one is read at once.
  const prevScope = useRef<string | null>(null)
  useEffect(() => {
    const before = prevScope.current
    prevScope.current = scope
    if (before === null || before === scope) return
    clearTimeout(later.current)
    later.current = undefined
    last.current = 0
    flight.current = null
    refresh(0)
  }, [scope, refresh])
  // This is the first read (after the first paint has had its reads: the bell is not what the page is waiting for) or the account's sites changed.
  useEffect(() => {
    if (!can) return
    let started = false
    const first = setTimeout(() => {
      started = true
      refresh()
    }, 3000)
    // A slow backstop for a page that has neither a /now nor a change of sites to go by.
    const stop = visibleInterval(() => refresh(), 5 * 60_000, false)
    // /now answering is the dashboard's pulse; a tab shown after a minute away looks at once.
    const pulse = onNowAnswer(() => started && refresh())
    let hiddenAt = 0
    const shown = () => {
      if (document.visibilityState === 'hidden') hiddenAt ||= Date.now()
      else {
        const away = hiddenAt ? Date.now() - hiddenAt : 0
        hiddenAt = 0
        if (away > GAP_MS) refresh(0)
      }
    }
    document.addEventListener('visibilitychange', shown)
    return () => {
      clearTimeout(first)
      stop()
      pulse()
      document.removeEventListener('visibilitychange', shown)
    }
  }, [sitesKey, can, refresh])
  const mark = useCallback((id: string | string[]) => send(Array.isArray(id) ? id : [id]), [send])
  const markAll = useCallback(() => {
    bellMore?.readAll()
    // Every row of this scope, the ones past the menu's cap too.
    send([...new Set([...fromFeed(rows, sites, now).map((i) => i.id), ...items.map((i) => i.id)])])
  }, [send, items, bellMore, rows, sites, now])
  // Ready when the whole list can be drawn at once: the server's rows, what the account has read (or the list of last time, with this browser's marks) and the build's own rows.
  const complete = loaded && (synced || kept) && (bellMore?.ready ?? true)
  // Once the whole list has been drawn it stays drawn: a read of it again (here or in a build's own list) never brings the placeholder back.
  // (Another team starts over: its own list is waited for.)
  const [drawn, setDrawn] = useState(complete ? scope : '')
  if (complete && drawn !== scope) setDrawn(scope)
  const ready = complete || drawn === scope
  return { items, scope, read, refresh, mark, markAll, can, ready, sites, dismiss: bellMore?.dismiss, archive: bellMore?.archive }
}
