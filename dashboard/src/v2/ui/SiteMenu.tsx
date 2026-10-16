// The site in the header, and the list that opens from it: every site with who is on it now, a finder, and what belongs to this site.
import { useState, type ReactNode } from 'react'
import { copy } from '../copy'
import { useMenu } from './useMenu'

export interface SiteItem {
  id: string
  name: string
  note?: string
  online: number
  down: boolean
}

export interface SiteMenuProps {
  sites: SiteItem[]
  current: string | null
  /** The workspace line at the top, when the account has one. */
  workspace?: { name: string; d: string }
  onPick: (id: string) => void
  footer: { key: string; label: ReactNode; run: () => void; dot?: 'ok' | 'down' }[]
  find: string
  all: string
}

export function SiteChip({ p }: { p: SiteMenuProps }) {
  const { open, attach, toggle, close } = useMenu()
  const [q, setQ] = useState('')
  const cur = p.sites.find((s) => s.id === p.current)
  const list = p.sites.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div ref={attach}>
      <button type="button" className="chip" aria-haspopup="menu" aria-expanded={open} data-key="site" onClick={toggle}>
        <span className={`dot ${cur?.down ? 'down' : ''}`} />
        <span className="nmx">{cur?.name ?? p.all}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" stroke="var(--mk-muted)" fill="none" strokeWidth="1.5" />
        </svg>
        <span className="kbd">{'S'}</span>
      </button>
      <div className={`menu${open ? ' on' : ''}`} id="siteMenu">
        {open && (
          <>
            {p.workspace && (
              <div className="mi ws">
                <span className="mt2">
                  <div className="nm">{p.workspace.name}</div>
                  <div className="d">{p.workspace.d}</div>
                </span>
              </div>
            )}
            <input placeholder={p.find} value={q} onChange={(e) => setQ(e.target.value)} aria-label={p.find} />
            <div>
              <button
                type="button"
                className={`mi ${p.current === null ? 'on' : ''}`}
                onClick={() => {
                  p.onPick('*')
                  close()
                }}
              >
                <span className="dot off" />
                <span>
                  <div className="nm">{p.all}</div>
                  <div className="d">{copy.overview}</div>
                </span>
              </button>
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`mi ${s.id === p.current ? 'on' : ''}`}
                  onClick={() => {
                    p.onPick(s.id)
                    close()
                  }}
                >
                  <span className={`dot ${s.down ? 'down' : ''}`} />
                  <span>
                    <div className="nm">{s.name}</div>
                    {s.note && <div className="d">{s.note}</div>}
                  </span>
                  <span className="now">
                    <b>{s.online}</b> {copy.nowWord}
                  </span>
                </button>
              ))}
            </div>
            <div className="mfoot col">
              {p.footer.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="mi"
                  onClick={() => {
                    f.run()
                    close()
                  }}
                >
                  {f.dot && <i className={`pdot ${f.dot === 'down' ? 'down' : ''}`} />}
                  <span className="mt2">
                    <div className="nm">{f.label}</div>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
