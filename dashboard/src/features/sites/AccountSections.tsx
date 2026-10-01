// The person's other accounts in the switcher, below the list of the one in
// view: one folded section each, "Name · Viewer · 3 sites", opening to its
// first few sites and "N more". Picking one moves the tab to that account.
// Nothing shows for a person in a single account.
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { SiteMark } from '../../components/SiteMark'
import { switchAccount } from '../../lib/accountMove'
import { view, type AccountCard } from '../../lib/accountView'
import { copy } from './menuCopy'

export function Section({ a, shut, onFold, onClose }: { a: AccountCard; shut: boolean; onFold: () => void; onClose: () => void }) {
  const go = (path: string) => {
    onClose()
    void switchAccount(a.id, path)
  }
  return (
    <section className="site-section" data-account={a.id}>
      <h3 className="site-head group">
        <button type="button" data-stop className="fold" aria-expanded={!shut} onClick={onFold}>
          <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
          <span className="acct-name">{a.name}</span>
          <span className="acct-meta">{copy.account.meta(a.role, a.total)}</span>
        </button>
      </h3>
      {!shut && (
        <ul className="site-group">
          {a.sites.map((s) => (
            <li key={s.id} className="site-row" data-site={s.id}>
              <button type="button" data-stop className="site" title={s.domain} onClick={() => go('/' + encodeURIComponent(s.domain))}>
                <SiteMark site={s} size={18} />
                <span className="name">
                  <b>{s.name || s.domain}</b>
                </span>
              </button>
            </li>
          ))}
          {a.total > a.sites.length && (
            <li className="site-row">
              <button type="button" data-stop className="site faint" onClick={() => go('/all')}>
                <span className="name">
                  <b>{copy.account.more(a.total - a.sites.length)}</b>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

export function AccountSections({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const others = view.list.filter((a) => a.id !== view.account)
  if (view.list.length < 2) return null
  return (
    <>
      {others.map((a) => (
        <Section key={a.id} a={a} shut={open !== a.id} onFold={() => setOpen(open === a.id ? null : a.id)} onClose={onClose} />
      ))}
    </>
  )
}
