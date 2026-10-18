// A site with no verified install is one setup screen, nothing else: the compact install (code, AI prompt,
// cookieless) and a live line that looks for the first visit. The visit turns the line green, and Live opens by itself.
import { Check } from 'lucide-react'
import { DOCS } from '../../components/footerLinks'
import type { InstallCheck, Site, Visit } from '../../lib/api'
import { copy as inst } from '../../features/install/copy'
import { Install } from '../../features/install/Install'
import { outcomeOf } from '../../features/install/outcome'
import { useInstallCheck, type InstallCheckHandle } from '../../features/install/useInstallCheck'
import { copy } from './copy'

const SUPPORT = 'https://github.com/trckable/trckable/issues'

const clock = (tz: string, at: number): string => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(at)

/** What the check last found, while it runs or when it is done. */
function foundOf(s: InstallCheckHandle['state']): InstallCheck | undefined {
  if (s.phase === 'done') return s.result
  return s.phase === 'checking' ? s.last : undefined
}

/** The live line: looking for the first visit, when it last looked, and Check now; green once the visit is in. */
function Line({ site, check, arrived }: { site: Site; check: InstallCheckHandle; arrived: boolean }) {
  if (arrived)
    return (
      <p className="setup-line ok" aria-live="polite" data-arrived="1">
        <Check size={16} strokeWidth={2.25} aria-hidden="true" />
        {copy.freshArrived}
      </p>
    )
  const s = check.state
  const busy = s.phase === 'checking'
  const found = foundOf(s)
  const out = found ? outcomeOf(found, site.domain) : null
  return (
    <div className="setup-check" aria-live="polite">
      <p className="setup-line">
        <span className="pulse" aria-hidden="true" />
        <span>
          {copy.freshChecking}
          {check.at !== null && <span className="faint"> {copy.freshLast(clock(site.timezone, check.at))}</span>}
        </span>
        <button type="button" className="linkish" disabled={busy} onClick={check.start}>
          {copy.freshCheckNow}
        </button>
      </p>
      {out && out.kind !== 'site' && <p className="faint setup-note">{out.text}</p>}
      {s.phase === 'limited' && <p className="faint setup-note">{inst.limited}</p>}
      {s.phase === 'failed' && <p className="faint setup-note">{inst.failed}</p>}
    </div>
  )
}

export default function Fresh({ site, visits }: { site: Site; visits: Visit[] }) {
  const arrived = visits.length > 0
  const check = useInstallCheck(site.id, arrived, true)
  return (
    <div className="mk mk-body mk-fresh">
      <section className="setup-screen rise" aria-label={copy.freshLabel}>
        <h1 className="setup-title">{inst.titleCard(site.domain)}</h1>
        <Install
          site={site}
          visits={visits}
          variant="setup"
          after={
            <>
              <Line site={site} check={check} arrived={arrived} />
              <p className="faint setup-help">
                {copy.freshHelp}{' '}
                <a href={DOCS} target="_blank" rel="noreferrer">
                  {copy.freshDocs}
                </a>
                {' · '}
                <a href={SUPPORT} target="_blank" rel="noreferrer">
                  {copy.freshSupport}
                </a>
              </p>
            </>
          }
        />
      </section>
    </div>
  )
}
