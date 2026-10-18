// Where the site is on its way to the first visit: one headline, at most one line, one action, and a small "Why?".
// Every state uses this same card; only the words and the action change (journey.ts says which state it is).
import { Check, TriangleAlert } from 'lucide-react'
import { Figure } from '../../figures/Figure'
import { DOCS } from '../../components/footerLinks'
import type { Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { useV2Extras } from '../../v2/slots'
import { journey as t } from './journeyCopy'
import { lastOf, stageOf, staleDays, whyOf, type Stage } from './journey'
import type { InstallCheckHandle } from './useInstallCheck'

const SUPPORT_DEFAULT = 'https://github.com/trckable/trckable/issues'

const clock = (tz: string, at: number): string => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(at)

/** The headline and the line of a stage. A site that has waited for days says so, in place of the first two. */
function wordsOf(stage: Stage, check: InstallCheckHandle, days: number): { head: string; line: string } {
  const last = lastOf(check.state)
  if (days > 0 && (stage === 'waiting' || stage === 'limited')) return { head: t.stale.head, line: t.stale.line(days) }
  switch (stage) {
    case 'unreachable':
      return { head: t.unreachable.head, line: t.unreachable.line }
    case 'blocked':
      return { head: t.blocked.head, line: t.blocked.line(last?.script_status ?? 0) }
    case 'waiting':
    case 'limited':
    case 'notfound':
    case 'wrongid':
    case 'found':
    case 'arrived':
      return t[stage]
  }
}

function Why({ stage, site, days }: { stage: Stage; site: Site; days: number }) {
  const support = useV2Extras().supportUrl ?? SUPPORT_DEFAULT
  const list = whyOf(stage)
  return (
    <details className="setup-why">
      <summary>{list ? t.why : t.help}</summary>
      {list && (
        <ul>
          {(list === 'missing' ? t.whyMissing : t.whyQuiet).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p>
        <a href={DOCS} target="_blank" rel="noreferrer">
          {t.docs}
        </a>
        <a href={support} target="_blank" rel="noreferrer">
          {t.support}
        </a>
        {days > 0 && (
          <button type="button" className="linkish" onClick={() => openSettings(site, 'site')}>
            {t.remove}
          </button>
        )}
      </p>
    </details>
  )
}

const toneOf = (stage: Stage): 'ok' | 'wait' | 'warn' => {
  if (stage === 'arrived') return 'ok'
  return stage === 'waiting' || stage === 'limited' || stage === 'found' ? 'wait' : 'warn'
}

export function SetupStatus({ site, check, arrived }: { site: Site; check: InstallCheckHandle; arrived: boolean }) {
  const stage = stageOf(check.state, arrived)
  const days = staleDays(site)
  const { head, line } = wordsOf(stage, check, days)
  const busy = check.state.phase === 'checking'
  const wait = stage === 'waiting' || stage === 'limited'
  const tone = toneOf(stage)
  return (
    <div className={'setup-status ' + tone} aria-live="polite" data-stage={stage}>
      <Figure name="logic" minWidth={641} done={stage === 'arrived'} className="setup-fig" />
      <div className="setup-head">
        {tone === 'ok' && <Check size={18} strokeWidth={2.25} aria-hidden="true" />}
        {tone === 'warn' && <TriangleAlert size={18} strokeWidth={1.75} aria-hidden="true" />}
        {tone === 'wait' && <span className="pulse" aria-hidden="true" />}
        <h2>{head}</h2>
      </div>
      <p className="setup-says">{line}</p>
      {stage !== 'arrived' && (
        <div className="setup-act">
          {stage === 'found' ? (
            <a className="btn primary" href={`https://${site.domain}`} target="_blank" rel="noreferrer">
              {t.open}
            </a>
          ) : (
            <button type="button" className="btn primary" disabled={busy} onClick={check.start}>
              {busy && <span className="btn-spin" aria-hidden="true" />}
              {wait ? t.now : t.again}
            </button>
          )}
          {check.at !== null && <span className="faint setup-last">{t.last(clock(site.timezone, check.at))}</span>}
          <Why stage={stage} site={site} days={days} />
        </div>
      )}
    </div>
  )
}
