// The first-run gate: an owner is held in the first run (add a site, install
// it, wait for its first visit) until one site has had a visit or they chose
// "Skip for now"; every address comes back to it. Once its first visit arrives the gate stays open for the
// session, so a slow site list cannot close it again. Skipping is remembered per account.
import { useEffect, useState } from 'react'
import { AccountMenu } from '../../components/AccountMenu'
import { Ghost } from '../../components/Logo'
import { type Site } from '../../lib/api'
import { needsFirstRun } from '../../lib/gate'
import { can } from '../../lib/permissions'
import { signOut } from '../../lib/signOut'
import { navigate } from '../../lib/url'
import { copy } from './copy'
import './nosites.css'
import { clearSkipped, markSkipped, wasSkipped } from './skipped'

export function useGate(sites: Site[] | null, mustChange: boolean, path: string, who: string | undefined) {
  const [passed, setPassed] = useState<string[]>([]) // accounts that got through the first run in this page's life
  const [, bump] = useState(0)
  const key = who ?? ''
  const open = passed.includes(key) || wasSkipped(who)
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
    /** Bring the first run back (the empty page's one action). */
    reopen: () => {
      clearSkipped(who)
      setPassed((all) => all.filter((k) => k !== key))
      bump((n) => n + 1)
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

/** Someone who may add sites, with none yet (they skipped the first run): one
 *  clear action, no tables, no site switcher. The account menu stays for Sign out. */
export function NoSites({ onAdd }: { onAdd: () => void }) {
  return (
    <main className="ns">
      <div className="ns-bar">
        <AccountMenu />
      </div>
      <Ghost size={56} />
      <h1>{copy.empty.title}</h1>
      <p className="muted">{copy.empty.sub}</p>
      <button type="button" className="btn primary big" onClick={onAdd}>
        {copy.empty.add}
      </button>
    </main>
  )
}
