// The first-run gate: an owner is held in the first run (add a site, install
// it, wait for its first visit) until one site has had a visit or they chose
// "Skip for now"; every address comes back to it. Once its first visit arrives the gate stays open for the
// session, so a slow site list cannot close it again.
import { useEffect, useState } from 'react'
import { Ghost } from '../../components/Logo'
import { type Site } from '../../lib/api'
import { needsFirstRun } from '../../lib/gate'
import { isViewer } from '../../lib/me'
import { signOut } from '../../lib/signOut'
import { navigate } from '../../lib/url'
import { wasSkipped } from './skipped'

export function useGate(sites: Site[] | null, mustChange: boolean, path: string) {
  const [passed, setPassed] = useState(wasSkipped)
  const gated = sites !== null && !mustChange && !passed && needsFirstRun(sites, !isViewer())
  useEffect(() => {
    if (gated && path !== '/') navigate('/', { replace: true })
  }, [gated, path])
  return { gated, pass: () => setPassed(true) }
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
