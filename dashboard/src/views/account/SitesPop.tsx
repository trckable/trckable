// The popover behind a viewer's sites button: a search, one row per site with
// its icon and domain, "All sites" and Done. Every tick is saved at once.
import { Check, Search } from 'lucide-react'
import { useState, type RefObject } from 'react'
import { AnchoredPop } from '../../components/AnchoredPop'
import { SiteMark } from '../../components/SiteMark'
import { toast } from '../../components/Toast'
import type { AccessSite } from '../../features/access/useSiteAccess'
import { messageOf, type SiteAccessList } from '../../lib/api'
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
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>
  viewer: Viewer
  sites: AccessSite[]
  email: string
  save: (id: string, sites: string[] | null) => Promise<unknown>
  onClose: () => void
}) {
  // What is ticked is kept here at once; the save follows, and a refusal puts it back.
  const [ticked, setTicked] = useState<string[] | null>(viewer.sites)
  const [query, setQuery] = useState('')
  const put = (next: string[] | null) => {
    const was = ticked
    setTicked(next)
    save(viewer.id, next).catch((e: unknown) => {
      setTicked(was)
      toast(messageOf(e) || t.sites.failed, 'error')
    })
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
          <div className="pop-list" role="menu" aria-label={t.sitesLabel}>
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
            <button type="button" data-nav className="pop-link" disabled={ticked === null} onClick={() => put(null)}>
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
