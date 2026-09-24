// The site switcher in the header. A native <select> looked like the browser,
// not like trckable, and on a phone it opened the system list: this is the same
// control in the product's own shape, with search once there are a few sites
// and a way straight to adding one.
import { useEffect, useMemo, useRef, useState } from 'react'
import { siteState, type Site } from '../lib/api'
import { navigate } from '../lib/url'
import { openAccount, openAddSite } from '../lib/account'
import { isViewer } from '../lib/me'

/** Green when the site sent something today, amber when it has gone quiet,
 *  hollow when nothing has ever arrived. */
function StateDot({ state }: { state: 'live' | 'quiet' | 'new' }) {
  const color = state === 'live' ? 'var(--accent)' : state === 'quiet' ? 'var(--money)' : 'var(--text-3)'
  return (
    <span
      className="dot"
      aria-hidden="true"
      title={state === 'live' ? 'Receiving visits' : state === 'quiet' ? 'No visits today' : 'Not installed yet'}
      style={{ background: state === 'new' ? 'transparent' : color, border: '1.5px solid ' + color, borderRadius: '50%', width: 9, height: 9 }}
    />
  )
}

export function SitePicker({ sites, current, all }: { sites: Site[]; current: Site | null; all?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return setQ('')
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    search.current?.focus()
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? sites.filter((s) => (s.name + ' ' + s.domain).toLowerCase().includes(t)) : sites
  }, [sites, q])

  const pick = (s: Site) => {
    setOpen(false)
    if (s.id !== current?.id) navigate('/' + encodeURIComponent(s.domain) + location.search)
  }

  return (
    <div className="site-pick" ref={root}>
      <button type="button" className="btn site-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {!all && <StateDot state={current ? siteState(current) : 'new'} />}
        <span className="name">{all ? 'All sites' : current?.name || current?.domain || 'Pick a site'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="pop sites" role="listbox" aria-label="Sites">
          {sites.length > 6 && (
            <input
              ref={search}
              className="input"
              placeholder="Search sites"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && shown[0] && pick(shown[0])}
            />
          )}
          <div className="sites-list">
            {/* Every site on one page, once there is more than one to compare. */}
            {sites.length > 1 && !q && (
              <button type="button" role="option" aria-selected={!!all} className={all ? 'site on' : 'site'} onClick={() => (setOpen(false), navigate('/all'))}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z" />
                </svg>
                <span className="name">
                  <b>All sites</b>
                  <span className="faint">every site, side by side</span>
                </span>
              </button>
            )}
            {shown.map((s) => (
              <button key={s.id} type="button" role="option" aria-selected={s.id === current?.id} className={s.id === current?.id ? 'site on' : 'site'} onClick={() => pick(s)}>
                <StateDot state={siteState(s)} />
                <span className="name">
                  <b>{s.name || s.domain}</b>
                  {siteState(s) === 'new' ? (
                    <span className="faint">not installed yet</span>
                  ) : siteState(s) === 'quiet' ? (
                    <span className="faint">no visits today</span>
                  ) : (
                    s.name && s.name !== s.domain && <span className="faint">{s.domain}</span>
                  )}
                </span>
                {s.id === current?.id && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m20 6-11 11-5-5" />
                  </svg>
                )}
              </button>
            ))}
            {shown.length === 0 && <p className="faint" style={{ margin: '8px 10px', fontSize: 13 }}>No site matches “{q}”.</p>}
          </div>
          <div className="sites-foot">
            {!isViewer() && (
              <>
                <button
                  type="button"
                  className="foot-main"
                  onClick={() => {
                    setOpen(false)
                    openAddSite()
                  }}
                >
                  <span className="foot-plus" aria-hidden="true">
                    +
                  </span>
                  <span>
                    <b>Add a site</b>
                    <span className="faint">domain, snippet, first visit</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="foot-side"
                  onClick={() => {
                    setOpen(false)
                    openAccount('sites')
                  }}
                >
                  Manage
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
