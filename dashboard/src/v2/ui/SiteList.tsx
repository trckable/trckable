// What opens from the header's site (the current team's sites only): a finder, All sites with today's visitors over
// the sites, then the sites as the account arranged them (pinned,
// named groups that fold, the others), and what belongs to this site. ↑/↓ and Enter move and open, 1–9 open the site with
// that number, Shift + Enter opens the site itself. Anyone who may change the account arranges it (drag, Alt + ↑/↓, or a
// site's ⋯ menu); the layout is saved for the whole account.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Site } from '../../lib/api'
import { useV2Extras } from '../slots'
import { can } from '../../lib/permissions'
import { openSettings } from '../../lib/settings'
import { navigate } from '../../lib/url'
import { prefetchSite } from '../../lib/dashQuery'
import { EMPTY, flat, placeKey, sectionsOf, type Place } from '../../features/sites/layout'
import { saveLayout, useSiteLayout } from '../../features/sites/useSiteLayout'
import { useReorder } from '../../features/sites/useReorder'
import { useFolded } from '../../features/sites/useFolded'
import { useToday } from '../../features/sites/useToday'
import { clashes, clashing, hasFinder, problemCounts, teamTotal } from '../../features/sites/menuLogic'
import { digitIndex, stepFocus, typing } from '../../features/sites/nav'
import { copy as menu } from '../../features/sites/menuCopy'
import { AllRow } from './AllRow'
import type { Arrange } from '../../features/sites/arrange'
import { SetupLine } from './SetupLine'
import { SiteRow } from './SiteRow'
import { SiteHead } from './SiteHead'
import { Search } from 'lucide-react'
import type { ReactNode } from 'react'

const PREFETCH = 3

interface SiteListProps {
  sites: Site[]
  current: Site | null
  /** A site by its id, or '*' for All sites. */
  onPick: (id: string) => void
  footer: ReactNode
  find: string
  all: string
  close: () => void
}

export function SiteList(p: SiteListProps) {
  const { sites, current } = p
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  const [q, setQ] = useState('')
  const [said, setSaid] = useState('')
  const [folded, fold] = useFolded()
  const numbers = useToday()
  const moves = useV2Extras().siteMoves
  const layout = useSiteLayout() ?? EMPTY
  // Opening the list starts the first few sites' reports, so a pick shows numbers at once.
  useEffect(() => {
    for (const s of sites.filter((x) => x.id !== current?.id).slice(0, PREFETCH)) prefetchSite(s)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once, when the list opens
  useEffect(() => {
    // Search takes the typing; the site you are on is in view when the list opens, however long it is. Only the list moves: the page stays where it is.
    ;(search.current ?? root.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? root.current?.querySelector<HTMLElement>('[data-stop]'))?.focus({ preventScroll: true })
    const box = list.current
    const on = box?.querySelector<HTMLElement>('[aria-current="page"]')
    if (box && on) box.scrollTop += on.getBoundingClientRect().top - box.getBoundingClientRect().top - (box.clientHeight - on.offsetHeight) / 2
  }, [])
  // A short list needs no finder; typing a letter on it brings the finder up with that letter.
  const finder = hasFinder(sites.length, q)
  const twice = useMemo(() => clashing(sites), [sites])
  useEffect(() => {
    const box = search.current
    if (q && box && document.activeElement !== box) box.focus({ preventScroll: true })
  }, [q, finder])
  const found = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? flat(sites, layout).filter((s) => (s.name + ' ' + s.domain).toLowerCase().includes(t)) : null
  }, [sites, layout, q])
  const committed = sectionsOf(sites, layout)
  const reorder = useReorder(sites, layout, committed, saveLayout, list)
  // While a site is dragged the rows show where it would land.
  const sections = reorder.preview ? sectionsOf(sites, reorder.preview) : committed
  // The sites on screen, top to bottom (a folded group's are not): 1–9 pick from them.
  const shown = found ?? sections.filter((sec) => !folded.has(placeKey(sec.place))).flatMap((sec) => sec.sites)
  const pick = (s: Site) => {
    p.close()
    if (s.id !== current?.id) p.onPick(s.id)
  }
  const arrange: Arrange | null = !can('site.settings')
    ? null
    : {
        sites,
        layout,
        drag: reorder.id,
        grab: reorder.grab,
        save: (l, words) => {
          saveLayout(l)
          if (words) setSaid(words)
        },
      }
  const item = (s: Site, place: Place) => (
    <SiteRow key={s.id} clash={clashes(twice, s)} move={moves?.(s.id, s.name || s.domain)} site={s} place={place} on={s.id === current?.id} arrange={found ? null : arrange} today={numbers?.get(s.id)?.visitors} settings={!can('site.settings') ? undefined : (tab) => { p.close(); openSettings(s, tab) }} status={() => { p.close(); navigate(`/${encodeURIComponent(s.domain)}/incidents`) }} onPick={() => pick(s)} />
  )
  const onKeys = (e: KeyboardEvent) => {
    const box = root.current
    // Not a chord (Alt + ↑/↓ moves a site).
    if (!box || e.altKey || e.ctrlKey || e.metaKey || !box.contains(e.target as Node)) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const stops = [...box.querySelectorAll<HTMLElement>('[data-stop]')]
      e.preventDefault()
      stops[stepFocus(stops.indexOf(e.target as HTMLElement), stops.length, e.key === 'ArrowDown' ? 1 : -1)]?.focus()
      return
    }
    if (!finder && /^[a-z]$/i.test(e.key)) {
      e.preventDefault()
      setQ(e.key)
      return
    }
    const at = typing(e.target) ? -1 : digitIndex(e.key, shown.length)
    if (at < 0) return
    e.preventDefault()
    pick(shown[at])
  }
  useEffect(() => {
    keys.current = onKeys
  })
  useEffect(() => {
    const box = root.current
    const on = (e: KeyboardEvent) => keys.current(e)
    box?.addEventListener('keydown', on)
    return () => box?.removeEventListener('keydown', on)
  }, [])
  return (
    <div className={`sitelist${reorder.id ? ' reordering' : ''}`} ref={root}>
      <SetupLine close={p.close} />
      {finder && (
        <div className="find-wrap">
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <input
            ref={search}
            id="siteFind"
            data-stop
            type="search"
            placeholder={p.find}
            aria-label={p.find}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && found?.[0] && pick(found[0])}
          />
        </div>
      )}
      <div id="siteList" ref={list}>
        {!found && <AllRow on={!current} total={teamTotal(numbers, sites)} problems={problemCounts(sites)} all={p.all} onPick={() => { p.close(); p.onPick('*') }} />}
        {found && <ul className="site-group">{found.map((s) => item(s, { kind: 'rest' }))}</ul>}
        {found?.length === 0 && <p className="mk-quiet sites-none">{menu.noMatch(q)}</p>}
        {!found &&
          sections.map((sec, at) => {
            const key = placeKey(sec.place)
            const shut = folded.has(key)
            const headed = sec.place.kind !== 'rest' || sections.length > 1
            return (
              <section key={key} className="site-section" data-section={key} aria-label={sec.place.kind === 'group' ? sec.place.name : undefined}>
                {headed && <SiteHead place={sec.place} column={at === 0 && numbers !== null} shut={shut} onFold={() => fold(key)} arrange={arrange} />}
                {!shut && (
                  <ul className="site-group">
                    {sec.sites.map((s) => item(s, sec.place))}
                    {sec.sites.length === 0 && <li className="mk-quiet sites-none">{menu.emptyGroup}</li>}
                  </ul>
                )}
              </section>
            )
          })}
      </div>
      <p className="sr" aria-live="polite">
        {said}
      </p>
      {p.footer}
    </div>
  )
}
