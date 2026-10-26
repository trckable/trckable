// Step two: the code is the hero; under it a calm line while the first visit is awaited.
// A warning about the site (cannot be reached, script not found) waits for two minutes, or for "Check now".
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Site, Visit } from '../../lib/api'
import { Install } from '../install/Install'
import { stageOf } from '../install/journey'
import { SetupStatus } from '../install/SetupStatus'
import { useInstallCheck } from '../install/useInstallCheck'
import { copy } from './copy'

/** How long a new site may wait before the page says what the check found. */
export const PATIENCE_MS = 120_000

export function InstallStep({ site, visits, onCopy, after }: { site: Site; visits: Visit[]; onCopy: () => void; after?: ReactNode }) {
  const arrived = visits.length > 0
  const check = useInstallCheck(site.id, arrived, true)
  // A press on the code's Copy button strengthens the glow of the journey.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    const on = (e: Event) => (e.target as Element).closest('.code-card button') && onCopy()
    el?.addEventListener('click', on)
    return () => el?.removeEventListener('click', on)
  }, [onCopy])
  const [asked, setAsked] = useState(false)
  const [late, setLate] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLate(true), PATIENCE_MS)
    return () => clearTimeout(t)
  }, [])
  const found = stageOf(check.state, arrived) === 'found'
  const ask = () => {
    setAsked(true)
    check.start()
  }
  return (
    <div ref={box} className="ob-install-step">
      <Install site={site} visits={visits} variant="setup" />
      {asked || late || found ? (
        <SetupStatus site={site} check={check} arrived={arrived} compact />
      ) : (
        <div className="ob-wait" aria-live="polite">
          <span className="pulse" aria-hidden="true" />
          <span>{copy.install.waiting}</span>
          <button type="button" className="btn ghost" disabled={check.state.phase === 'checking'} onClick={ask}>
            {copy.install.check}
          </button>
        </div>
      )}
      {after}
    </div>
  )
}
