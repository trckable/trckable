// What payments unlock, and where to connect them: the five providers, each a
// way into Settings → Payments with its connect step already open.
import { SideCard } from '../../components/SideCard/SideCard'
import type { Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { revenueCopy } from './revenueCopy'

const t = revenueCopy.card

export function ProviderCard({ site, onClose }: { site: Site; onClose: () => void }) {
  return (
    <SideCard
      id="revenue-providers"
      asked
      label={t.label}
      closeLabel={t.close}
      title={t.title}
      onClose={onClose}
      actions={
        <button type="button" className="btn" onClick={onClose}>
          {t.close}
        </button>
      }
    >
      <p className="muted prov-body">{t.body}</p>
      <ul className="prov-links">
        {revenueCopy.providers.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              aria-label={t.connect(p.name)}
              onClick={() => {
                onClose()
                openSettings(site, 'payments', { connect: p.id })
              }}
            >
              <span>{p.name}</span>
              <span className="faint">{t.go}</span>
            </button>
          </li>
        ))}
      </ul>
    </SideCard>
  )
}
