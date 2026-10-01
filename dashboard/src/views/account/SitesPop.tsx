// The popover behind a viewer's sites button: a search, one row per site with
// its icon and domain, "All sites" and Done. Every tick is saved at once.
import { Check, Search } from 'lucide-react'
import { useRef, useState, type RefObject } from 'react'
import { AnchoredPop } from '../../components/AnchoredPop'
import { SiteMark } from '../../components/SiteMark'
import type { AccessSite } from '../../features/access/useSiteAccess'
import { fail, type SiteAccessList } from '../../lib/api'
import { people as t } from './peopleCopy'
import { findSites, toggledSites } from './rules'
import './peoplePop.css'

type Viewer = SiteAccessList['viewers'][number]

export default function SitesPop({
  anchor,
  viewer,
  sites,
  email,
  save,
  reload,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>
  viewer: Viewer
  sites: AccessSite[]
  email: string
  save: (id: string, sites: string[] | null) => Promise<unknown>
  reload: () => Promise<SiteAccessList | null>
  onClose: () => void
}) {
  // What is ticked is kept here at once. Saves go one at a time: ticks made
  // while one is in flight are sent as one save of the newest state when it
  // finishes, so answers can never arrive out of order. A refusal reads the
  // server's list again and shows that.
  const [ticked, setTicked] = useState<string[] | null>(viewer.sites)
  const [query, setQuery] = useState('')
  const newest = useRef<string[] | null>(viewer.sites)
  const sending = useRef(false)
  const flush = () => {
    if (sending.current) return
    const sent = newest.current
    sending.current = true
    save(viewer.id, sent)
      .then(() => {
        sending.current = false
        if (newest.current !== sent) flush()
      })
      .catch((e: unknown) => {
        sending.current = false
        fail(e)
        void reload().then((list) => {
          const now = list?.viewers.find((v) => v.id === viewer.id)
          if (!now) return
          newest.current = now.sites
          setTicked(now.sites)
        })
      })
  }
  const put = (next: string[] | null) => {
    newest.current = next
    setTicked(next)
    flush()
  }
  const shown = findSites(sites, query)
  const count = ticked === null ? sites.length : sites.filter((s) => ticked.includes(s.id)).length
  return (
    <AnchoredPop anchor={anchor} label={t.sites.of(count, sites.length) + ' · ' + email} className="sites-pop" onClose={onClose}>
      {(close) => (
        <>
          <label className="pop-search">
            <Search size={15} strokeWidth={1.75} aria-hidden="true" />
            <input data-nav data-autofocus aria-label={t.sites.find} placeholder={t.sites.find} value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="faint num">{t.sites.of(count, sites.length)}</span>
          </label>
          {/* A list that scrolls is a tab stop of its own, so the keyboard can always reach it. */}
          <div className="pop-list" role="menu" aria-label={t.sitesLabel} tabIndex={0}>
            {shown.map((s) => {
              const on = ticked === null || ticked.includes(s.id)
              return (
                <button key={s.id} type="button" role="menuitemcheckbox" aria-checked={on} data-nav className="pop-row" onClick={() => put(toggledSites(ticked, sites, s.id))}>
                  <span className={'pop-box' + (on ? ' on' : '')} aria-hidden="true">
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <SiteMark site={s} size={20} />
                  <span className="pop-name">{s.name || s.domain}</span>
                  {s.name && s.name !== s.domain && <span className="pop-sub faint">{s.domain}</span>}
                </button>
              )
            })}
            {shown.length === 0 && <span className="pop-empty faint">{t.sites.empty}</span>}
          </div>
          <div className="pop-foot">
            <button type="button" data-nav className="pop-link" title={t.sites.allWhy} disabled={ticked === null} onClick={() => put(null)}>
              {t.sites.all}
            </button>
            <button type="button" data-nav className="pop-link primary" onClick={close}>
              {t.sites.done}
            </button>
          </div>
        </>
      )}
    </AnchoredPop>
  )
}
