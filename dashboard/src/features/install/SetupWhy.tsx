// What the install check found when it is not good news: one line, the way out, and a small "Why?".
import { DOCS } from '../../components/footerLinks'
import type { Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { useV2Extras } from '../../v2/slots'
import { journey as t } from './journeyCopy'
import { lastOf, staleDays, whyOf, type Stage } from './journey'
import type { InstallCheckHandle } from './useInstallCheck'

const SUPPORT_DEFAULT = 'https://github.com/trckable/trckable/issues'

/** The finding of a stage. A site that has waited for days says so, in place of the first two. */
export function findingOf(stage: Stage, check: InstallCheckHandle, days: number): { head: string; line: string } {
  const last = lastOf(check.state)
  if (days > 0 && (stage === 'waiting' || stage === 'limited')) return { head: t.stale.head, line: t.stale.line(days) }
  switch (stage) {
    case 'elsewhere': {
      const hosts = last?.elsewhere ?? []
      return { head: t.elsewhere.head, line: t.elsewhere.line(hosts[0]?.host ?? '', hosts.length - 1) }
    }
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

export function Why({ stage, site }: { stage: Stage; site: Site }) {
  const support = useV2Extras().supportUrl ?? SUPPORT_DEFAULT
  const days = staleDays(site)
  const list = whyOf(stage)
  return (
    <details className="setup-why">
      <summary>{list ? t.why : t.help}</summary>
      {list && (
        <ul>
          {{ missing: t.whyMissing, offline: t.whyOffline, quiet: t.whyQuiet }[list].map((w) => (
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
