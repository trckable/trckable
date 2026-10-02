// The first screen's two short actions, for an owner: bring history in, and
// the weekly email. Icons and short labels; the words are in firstCopy.ts.
import { History, Mail } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Switch } from '../../components/Switch'
import type { Site } from '../../lib/api'
import { canChange } from '../../lib/me'
import { first } from './firstCopy'
import { useWeeklyEmail } from './useWeeklyEmail'
import './firstActions.css'

const ImportDialog = lazy(() => import('./ImportDialog').then((m) => ({ default: m.ImportDialog })))

/** `quiet`: the first run, where Settings is out of reach, so a switch that
 *  could only send you there is left out. */
export function FirstActions({ site, quiet = false }: { site: Site; quiet?: boolean }) {
  return canChange() ? <Actions site={site} quiet={quiet} /> : null
}

function Actions({ site, quiet }: { site: Site; quiet: boolean }) {
  const [importing, setImporting] = useState(false)
  const weekly = useWeeklyEmail(site)
  const showWeekly = weekly.ready && (weekly.deliverable || !quiet)
  const label = weekly.on || weekly.deliverable ? first.weekly : first.weeklyOff
  return (
    <div className="fa" role="group" aria-label={first.label}>
      <button type="button" className="btn fa-item" onClick={() => setImporting(true)}>
        <History size={16} strokeWidth={1.75} aria-hidden="true" />
        {first.import}
      </button>
      {showWeekly && (
        <div className="btn fa-item fa-weekly">
          <Mail size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{label}</span>
          <Switch on={weekly.on} label={label} disabled={weekly.busy} onChange={weekly.toggle} />
        </div>
      )}
      {importing && (
        <Suspense fallback={null}>
          <ImportDialog domain={site.domain} onClose={() => setImporting(false)} />
        </Suspense>
      )}
    </div>
  )
}
