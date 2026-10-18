// The install of a site that has had no visit, as a whole: the compact install, then one live line that looks for the
// first visit (and goes green when it lands). Used by the setup screen of an unverified site and by the first run.
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { DOCS } from '../../components/footerLinks'
import type { InstallCheck, Site, Visit } from '../../lib/api'
import { copy } from '../../v2/briefing/copy'
import { useV2Extras } from '../../v2/slots'
import { copy as inst } from './copy'
import { Install } from './Install'
import { outcomeOf } from './outcome'
import { useInstallCheck, type InstallCheckHandle } from './useInstallCheck'

const SUPPORT_DEFAULT = 'https://github.com/trckable/trckable/issues'

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

function Help() {
  const support = useV2Extras().supportUrl ?? SUPPORT_DEFAULT
  return (
    <p className="faint setup-help">
      {copy.freshHelp}{' '}
      <a href={DOCS} target="_blank" rel="noreferrer">
        {copy.freshDocs}
      </a>
      {' · '}
      <a href={support} target="_blank" rel="noreferrer">
        {copy.freshSupport}
      </a>
    </p>
  )
}

/** help: Docs and Support under the line. after: anything else under it (the first run's own links). */
export function SetupInstall({ site, visits, help, after }: { site: Site; visits: Visit[]; help?: boolean; after?: ReactNode }) {
  const arrived = visits.length > 0
  const check = useInstallCheck(site.id, arrived, true)
  return (
    <Install
      site={site}
      visits={visits}
      variant="setup"
      after={
        <>
          <Line site={site} check={check} arrived={arrived} />
          {help && <Help />}
          {after}
        </>
      }
    />
  )
}

export default SetupInstall
