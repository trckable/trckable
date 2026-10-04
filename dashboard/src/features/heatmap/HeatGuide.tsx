// The side card that suggests heatmaps for a busy page: what it would show, a
// preview on example data, and the way to turn it on (Settings → Modules, where
// its size and what it keeps are written out before anything changes).
import { Flame } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { SideCard } from '../../components/SideCard/SideCard'
import type { ReportQuery, Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { heatCopy } from './copy'
import { markHeatDone } from './guide'

const HeatOverlay = lazy(() => import('./HeatOverlay'))

export function HeatGuide({ site, path, views, query, onAway }: { site: Site; path: string; views: number; query: ReportQuery; onAway: () => void }) {
  const [preview, setPreview] = useState(false)
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
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                away()
                openSettings(site, 'modules')
              }}
            >
              {t.go}
            </button>
          </>
        }
      >
        <p className="muted why-body">{t.body}</p>
      </SideCard>
      {preview && (
        <Suspense fallback={null}>
          <HeatOverlay site={site} path={path} query={query} demo onClose={() => setPreview(false)} />
        </Suspense>
      )}
    </>
  )
}
