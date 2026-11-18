// A site that waits for its first visit, as one screen used by the first run and by the page of an unverified site: the
// words and the code on the left, the install status beside them (a bar at the bottom on a phone). It owns the check, and
// holds a problem back for two minutes (or until "Check now"): a person who has only just copied the code has not pasted it yet.
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import type { Site, Visit } from '../../lib/api'
import { Install, type Extras } from './Install'
import { stageOf, type Stage } from './journey'
import { SetupExtras } from './SetupExtras'
import { SetupPanel } from './SetupPanel'
import { useCookieless } from './useCookieless'
import { useInstallCheck } from './useInstallCheck'

/** How long a new site may wait before the page says what the check found. */
export const PATIENCE_MS = 120_000

type Props = { site: Site; visits: Visit[]; title: string; sub: ReactNode; heading?: Ref<HTMLHeadingElement>; onCopy?: () => void }

export function SetupScreen({ site, visits, title, sub, heading, onCopy }: Props) {
  const arrived = visits.length > 0
  const check = useInstallCheck(site.id, arrived, true)
  const [asked, setAsked] = useState(false)
  const [late, setLate] = useState(false)
  const cookieless = useCookieless(site.id)
  const [extras, setExtras] = useState<Extras | null>(null)
  const more = extras && <SetupExtras extras={extras} cookieless={cookieless} />
  useEffect(() => {
    const t = setTimeout(() => setLate(true), PATIENCE_MS)
    return () => clearTimeout(t)
  }, [])
  const real = stageOf(check.state, arrived)
  const stage: Stage = asked || late || real === 'found' || real === 'arrived' ? real : 'waiting'
  // A press on the code's Copy button strengthens the glow of the first run's journey.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el || !onCopy) return
    const on = (e: Event) => (e.target as Element).closest('.code-card button') && onCopy()
    el.addEventListener('click', on)
    return () => el.removeEventListener('click', on)
  }, [onCopy])
  const ask = () => {
    setAsked(true)
    check.start()
  }
  return (
    <div className="setup-cols">
      <div ref={box} className="setup-main">
        <div className="setup-words">
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          <p className="muted">{sub}</p>
        </div>
        <Install site={site} visits={visits} variant="setup" cookieless={cookieless} onExtras={setExtras} />
        {more && <div className="ist-extras-phone">{more}</div>}
      </div>
      <SetupPanel site={site} check={check} stage={stage} onCheck={ask} extras={more} />
    </div>
  )
}

export default SetupScreen
