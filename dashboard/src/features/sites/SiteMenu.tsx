// The site switcher's list: All sites as a chip at the top, pinned sites,
// named groups with headers that fold, the other sites, and Add a site at the
// bottom. ↑/↓ and Enter move and open, 1–9 open the site with that number.
// Anyone who may change the account arranges it (drag, Alt + ↑/↓, or a
// site's ⋯ menu); the layout is saved for the whole account.
import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type Site, type SiteLayout } from '../../lib/api'
import { navigate } from '../../lib/url'
import { openAddSite } from '../../lib/account'
import { canChange, isViewer } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { copy } from './menuCopy'
import { EMPTY, flat, placeKey, sectionsOf, type Place } from './layout'
import { saveLayout, useSiteLayout } from './useSiteLayout'
import { SiteItem } from './SiteItem'
import { SectionHead } from './SectionHead'
import { AllStrip } from './AllStrip'
import { MenuFoot } from './MenuFoot'
import { digitIndex, stepFocus, typing } from './nav'
import { useToday } from './useToday'
import { useFolded } from './useFolded'
import { densityOf } from './density'
import { prefetchSite } from '../../lib/dashQuery'
import './siteMenu.css'
import '../../components/Modal.css'

const PREFETCH = 3

/** More sites than this and the list gets a search. */
const SEARCH_FROM = 6

export interface Arrange {
  sites: Site[]
  layout: SiteLayout
  save: (l: SiteLayout, said?: string) => void
  drag: string | null
  setDrag: (id: string | null) => void
}

export function SiteMenu({ sites: given, current, all, onClose }: { sites: Site[]; current: Site | null; all: boolean; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  const search = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [said, setSaid] = useState('')
  const [drag, setDrag] = useState<string | null>(null)
  const [folded, fold] = useFolded()
  const numbers = useToday()
  const layout = useSiteLayout() ?? EMPTY
  // The dots come from the sites list, read again on opening (one small
  // query for all of them), so "right now" is right now.
  const [sites, setSites] = useState(given)
  // Opening the list starts the first few sites' reports, so a pick shows
  // numbers at once; the rest start when pointed at (SiteItem).
  useEffect(() => {
    for (const s of given.filter((x) => x.id !== current?.id).slice(0, PREFETCH)) prefetchSite(s)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once, when the list opens

  useEffect(() => {
    api
      .sites()
      .then((r) => setSites(r.sites ?? given))
      .catch(() => {}) // the list the page has is still right, only older
  }, [given])

  useEffect(() => {
    // Outside the switcher closes it, but not its own ⋯ menus and dialogs,
    // which live at the end of the page.
    const away = (e: MouseEvent) => {
      const t = e.target as Element
      if (!t.closest?.('.site-pick, .floating, .modal-back')) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal-back, .floating') && onClose()
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    // Search takes the typing; without one the site you are on takes the keys.
    const box = root.current
    const start = search.current ?? box?.querySelector<HTMLElement>('[aria-current="page"]') ?? box?.querySelector<HTMLElement>('[data-stop]')
    start?.focus()
    // The site you are on is in view when the list opens, however long it is.
    document.querySelector('.site-pick [aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])

  const found = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? flat(sites, layout).filter((s) => (s.name + ' ' + s.domain).toLowerCase().includes(t)) : null
  }, [sites, layout, q])
  const sections = sectionsOf(sites, layout)
  // The sites on screen, top to bottom (a folded group's are not): 1–9 pick from them.
  const shown = found ?? sections.filter((sec) => !folded.has(placeKey(sec.place))).flatMap((sec) => sec.sites)
  const pick = (s: Site) => {
    onClose()
    if (s.id !== current?.id) navigate('/' + encodeURIComponent(s.domain) + location.search)
  }
  const arrange: Arrange | null = isViewer()
    ? null
    : {
        sites,
        layout,
        drag,
        setDrag,
        save: (l, words) => {
          saveLayout(l)
          if (words) setSaid(words)
        },
      }
  const density = densityOf(sites.length)
  const item = (s: Site, place: Place) => {
    const n = shown.indexOf(s) + 1
    return <SiteItem key={s.id} site={s} place={place} density={density} on={s.id === current?.id} arrange={found ? null : arrange} today={numbers?.get(s.id)?.visitors} key1={n > 0 && n <= 9 ? n : undefined} onPick={() => pick(s)} />
  }
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
    const at = typing(e.target) ? -1 : digitIndex(e.key, shown.length)
    if (at < 0) return
    e.preventDefault()
    pick(shown[at])
  }
  useEffect(() => {
    keys.current = onKeys
  })
  useEffect(() => {
    // On the list itself, so the ⋯ menus and dialogs (at the end of the page) keep their own keys.
    const box = root.current
    const on = (e: KeyboardEvent) => keys.current(e)
    box?.addEventListener('keydown', on)
    return () => box?.removeEventListener('keydown', on)
  }, [])

  return (
    <div className={'pop sites ' + density} role="dialog" aria-label={copy.sites} ref={root}>
      {sites.length > SEARCH_FROM && (
        <label className="menu-search">
          <Search size={17} strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={search}
            data-stop
            type="search"
            placeholder={copy.search}
            aria-label={copy.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && found?.[0] && pick(found[0])}
          />
        </label>
      )}
      {/* Every site on one page, once there is more than one to compare. */}
      {sites.length > 1 && !found && <AllStrip on={all} numbers={numbers} onPick={() => { onClose(); navigate('/all') }} />}
      <div className="sites-list" title={arrange && sites.length > 1 ? copy.keys : undefined}>
        {found && <ul className="site-group">{found.map((s) => item(s, { kind: 'rest' }))}</ul>}
        {found?.length === 0 && <p className="faint sites-none">{copy.noMatch(q)}</p>}
        {!found &&
          sections.map((sec) => {
            const key = placeKey(sec.place)
            const shut = folded.has(key)
            const headed = sec.place.kind !== 'rest' || sections.length > 1
            return (
              <section key={key} className="site-section" aria-label={sec.place.kind === 'group' ? sec.place.name : undefined}>
                {headed && <SectionHead place={sec.place} count={sec.sites.length} shut={shut} onFold={() => fold(key)} arrange={arrange} />}
                {!shut && (
                  <ul className="site-group">
                    {sec.sites.map((s) => item(s, sec.place))}
                    {sec.sites.length === 0 && <li className="faint sites-none">{copy.emptyGroup}</li>}
                  </ul>
                )}
              </section>
            )
          })}
      </div>
      <p className="sr" aria-live="polite">
        {said}
      </p>
      <MenuFoot canAdd={!isViewer()} onAdd={() => { onClose(); openAddSite() }} settings={current && canChange() ? { label: copy.settingsFor(current.domain), open: () => { onClose(); openSettings(current) } } : undefined} />
    </div>
  )
}
