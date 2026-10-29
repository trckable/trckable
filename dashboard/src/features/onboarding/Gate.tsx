// The first-run gate: an owner is held in the first run (add a site, install
// it, wait for its first visit) until one site has had a visit or they chose
// "Skip for now"; every address comes back to it. Once its first visit arrives the gate stays open for the
// session, so a slow site list cannot close it again. Skipping is remembered per account.
import { type SyntheticEvent, useEffect, useState } from 'react'
import { AccountMenu } from '../../components/AccountMenu'
import { Ghost } from '../../components/Logo'
import { type Site } from '../../lib/api'
import { openAddSite } from '../../lib/account'
import { needsFirstRun } from '../../lib/gate'
import { can } from '../../lib/permissions'
import { signOut } from '../../lib/signOut'
import { navigate } from '../../lib/url'
import { checkDomain, cleanDomain } from '../install/domain'
import { copy } from './copy'
import './nosites.css'
import { markSkipped, wasSkipped } from './skipped'

export function useGate(sites: Site[] | null, mustChange: boolean, path: string, who: string | undefined) {
  const [passed, setPassed] = useState<string[]>([]) // accounts that got through the first run in this page's life
  const key = who ?? ''
  // A skip holds only once there is a site to go to: an owner with none is always in the first run.
  const open = passed.includes(key) || (wasSkipped(who) && (sites?.length ?? 0) > 0)
  const gated = sites !== null && !mustChange && !open && needsFirstRun(sites, can('site.add'))
  useEffect(() => {
    if (gated && path !== '/') navigate('/', { replace: true })
  }, [gated, path])
  return {
    gated,
    pass: (skipped = false) => {
      if (skipped) markSkipped(who)
      setPassed((all) => [...all, key])
    },
  }
}

const NONE = 'No sites shared with you yet.'
const OUT = 'Sign out'

/** A viewer with nothing shared with them: a read-only note, never the first run. */
export function NoneShared() {
  return (
    <main className="ld ld-page">
      <Ghost size={56} />
      <p className="muted">{NONE}</p>
      <button type="button" className="btn" onClick={() => signOut()}>
        {OUT}
      </button>
    </main>
  )
}

/** Someone who may add sites, with none yet (a new team, or every site removed): the first run's
 *  first step right here, the site's address and Start, with what follows in three lines. The
 *  account menu stays for Sign out. */
export function NoSites() {
  const [raw, setRaw] = useState('')
  const [bad, setBad] = useState(false)
  const t = copy.empty
  const start = (e: SyntheticEvent) => {
    e.preventDefault()
    const domain = cleanDomain(raw)
    if (raw.trim() && checkDomain(domain, raw) !== 'ok') {
      setBad(true)
      return
    }
    openAddSite(raw.trim() ? { domain, taken: false } : null)
  }
  return (
    <main className="ns">
      <div className="ns-bar">
        <AccountMenu />
      </div>
      <Ghost size={56} />
      <h1>{t.title}</h1>
      <p className="muted">{t.sub}</p>
      <form className="ns-form" onSubmit={start}>
        <input
          className="input"
          aria-label={t.field}
          placeholder={t.placeholder}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setBad(false)
          }}
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        <button type="submit" className="btn primary big">
          {t.add}
        </button>
      </form>
      {bad && <p className="ns-bad" role="alert">{t.bad}</p>}
      <ol className="ns-steps">
        {t.steps.map((s, i) => (
          <li key={s}>
            <span className="num">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </main>
  )
}
