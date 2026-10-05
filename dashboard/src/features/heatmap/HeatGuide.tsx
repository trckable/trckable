// The side card that suggests heatmaps for a busy page: what it would show, a
// preview on example data, and the way to turn it on (Settings → Modules, where
// its size and what it keeps are written out before anything changes).
import { Flame } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { cardModal } from '../../components/CardModal/copy'
import { SideCard } from '../../components/SideCard/SideCard'
import type { ReportQuery, Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { heatCopy } from './copy'
import HeatModal from './HeatModal'
import { markHeatDone } from './guide'

const HeatOverlay = lazy(() => import('./HeatOverlay'))

export function HeatGuide({ site, path, views, query, onAway }: { site: Site; path: string; views: number; query: ReportQuery; onAway: () => void }) {
  const [preview, setPreview] = useState(false)
  const [open, setOpen] = useState(false)
  const t = heatCopy.card
  const away = () => {
    markHeatDone(site.id)
    onAway()
  }
  return (
    <>
      <SideCard
        id="discover"
        label={t.label}
        closeLabel={t.close}
        kind={{ icon: <Flame size={14} strokeWidth={2} />, label: t.label, tint: 'var(--ch-2)' }}
        title={t.title(path, views)}
        onClose={away}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => setPreview(true)}>
              {t.preview}
            </button>
            <button type="button" className="btn primary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
              {cardModal.details}
            </button>
          </>
        }
      >
        <p className="muted why-body">{t.body}</p>
      </SideCard>
      {open && (
        <HeatModal
          site={site}
          path={path}
          views={views}
          onClose={() => setOpen(false)}
          onPreview={() => {
            setOpen(false)
            setPreview(true)
          }}
          onGo={() => {
            away()
            openSettings(site, 'modules')
          }}
        />
      )}
      {preview && (
        <Suspense fallback={null}>
          <HeatOverlay site={site} path={path} query={query} demo onClose={() => setPreview(false)} />
        </Suspense>
      )}
    </>
  )
}
