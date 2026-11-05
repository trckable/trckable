// The small row above the preview: which site, light or dark, the accent,
// the number, the small numbers.
import { Moon, Sun } from 'lucide-react'
import type { Site } from '../../lib/api'
import { Select } from '../../components/Select'
import { SiteMark } from '../../components/SiteMark'
import { accentsFor, type Look, type Metric } from './card'
import { copy } from './copy'
import { StatsPick } from './StatsPick'

type Props = {
  site: Site
  sites: Site[]
  onSite: (id: string) => void
  look: Look
  set: (l: Partial<Look>) => void
  metrics: Metric[]
  revenue: boolean
}

export function Toolbar({ site, sites, onSite, look, set, metrics, revenue }: Props) {
  const post = look.template === 'post'
  const nextTheme = look.theme === 'dark' ? 'light' : 'dark'
  const ThemeIcon = look.theme === 'dark' ? Moon : Sun
  return (
    <div className="sd-toolbar">
      <Select className="sd-site" mark={<SiteMark site={site} size={20} />} value={site.id} title={copy.site} aria-label={copy.site} onChange={(e) => onSite(e.target.value)}>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.domain}
          </option>
        ))}
      </Select>
      {look.template !== 'leaderboard' && (
        <div className="seg small" role="group" aria-label={copy.metric}>
          {metrics.map((m) => (
            <button key={m} type="button" aria-pressed={look.metric === m} onClick={() => set({ metric: m })}>
              {copy.metrics[m]}
            </button>
          ))}
        </div>
      )}
      {look.template === 'overview' && <StatsPick look={look} revenue={revenue} set={set} />}
      {!post && (
        <>
          <button type="button" className="btn icon sd-tool" title={copy[look.theme]} aria-label={copy[nextTheme]} onClick={() => set({ theme: nextTheme })}>
            <ThemeIcon size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <div className="sd-swatches" role="radiogroup" aria-label={copy.accent}>
            {accentsFor(site.color).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={look.accent === c} aria-label={c} className="sd-swatch" style={{ backgroundColor: c }} onClick={() => set({ accent: c })} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
