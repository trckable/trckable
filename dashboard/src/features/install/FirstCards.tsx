// The first screen's two nudges, for an owner, as side cards: bring history in,
// and the weekly email. One at a time, each shown until it is acted on or put
// away, then never again for that site. The words are in firstCopy.ts.
import { FileUp, Mail } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { cardModal } from '../../components/CardModal/copy'
import { SideCard } from '../../components/SideCard/SideCard'
import type { Site } from '../../lib/api'
import { canChange } from '../../lib/me'
import { first } from './firstCopy'
import { useSeen } from './seen'
import { useWeeklyEmail } from './useWeeklyEmail'
import './firstActions.css'

const ImportDialog = lazy(() => import('./ImportDialog').then((m) => ({ default: m.ImportDialog })))
const DiscoverModal = lazy(() => import('../moments/DiscoverModal'))

const t = first.cards

/** `quiet`: the first run, where Settings is out of reach, so a card that
 *  could only send you there is left out. */
export function FirstCards({ site, quiet = false }: { site: Site; quiet?: boolean }) {
  return canChange() ? <Cards site={site} quiet={quiet} /> : null
}

function Cards({ site, quiet }: { site: Site; quiet: boolean }) {
  const [importing, setImporting] = useState(false)
  const [asking, setAsking] = useState(false)
  const [importSeen, putImportAway] = useSeen('import', site.id)
  const [weeklySeen, putWeeklyAway] = useSeen('weekly', site.id)
  const weekly = useWeeklyEmail(site)
  // The dialog has the screen while it is open; the weekly card waits for it.
  const showWeekly = weekly.ready && !weekly.on && (weekly.deliverable || !quiet) && !weeklySeen && !importing
  return (
    <>
      {!importSeen && (
        <SideCard
          id="first-import"
          label={t.import.label}
          closeLabel={t.close}
          kind={{ icon: <FileUp size={14} strokeWidth={2} />, label: t.import.label, tint: 'var(--ch-1)' }}
          title={t.import.title}
          onClose={putImportAway}
          actions={
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                putImportAway()
                setImporting(true)
              }}
            >
              {t.import.go}
            </button>
          }
        >
          <p className="muted fa-body">{t.import.body}</p>
        </SideCard>
      )}
      {showWeekly && (
        <SideCard
          id="first-weekly"
          label={t.weekly.label}
          closeLabel={t.close}
          kind={{ icon: <Mail size={14} strokeWidth={2} />, label: t.weekly.label, tint: 'var(--ch-5)' }}
          title={t.weekly.title}
          onClose={putWeeklyAway}
          actions={
            <button type="button" className="btn primary" aria-haspopup="dialog" onClick={() => setAsking(true)}>
              {cardModal.details}
            </button>
          }
        >
          <p className="muted fa-body">{t.weekly.body}</p>
        </SideCard>
      )}
      {asking && (
        <Suspense fallback={null}>
          <DiscoverModal id="weekly" Icon={Mail} tint="var(--ch-5)" text={t.weekly} tz={site.timezone} series={[]} busy={weekly.busy} onClose={() => setAsking(false)} onGo={() => {
              setAsking(false)
              weekly.toggle(putWeeklyAway)
            }} />
        </Suspense>
      )}
      {importing && (
        <Suspense fallback={null}>
          <ImportDialog domain={site.domain} site={site.id} onClose={() => setImporting(false)} />
        </Suspense>
      )}
    </>
  )
}
