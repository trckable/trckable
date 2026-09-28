// The small row above the preview: which site, light or dark, the accent,
// the number; and apart, the one thing to do with it.
import { Check, Copy, Download, Moon, Sun } from 'lucide-react'
import type { Site } from '../../lib/api'
import { SiteMark } from '../../components/SiteMark'
import { accentsFor, type Look, type Metric } from './card'
import { copy } from './copy'

type Props = {
  site: Site
  sites: Site[]
  onSite: (id: string) => void
  look: Look
  set: (l: Partial<Look>) => void
  metrics: Metric[]
}

/** The one thing to do: download the PNG, or copy the post. */
export function GoButton({ post, busy, done, onGo }: { post: boolean; busy: boolean; done: boolean; onGo: () => void }) {
  const GoIcon = post ? Copy : Download
  return (
    <button type="button" className="btn primary sd-go" disabled={busy} title={post ? copy.copyText : copy.downloadTitle} onClick={onGo}>
      {busy && <span className="btn-spin" aria-hidden="true" />}
      {!busy && done && <Check size={16} strokeWidth={2.4} aria-hidden="true" />}
      {!busy && !done && <GoIcon size={16} strokeWidth={1.9} aria-hidden="true" />}
      {post ? copy.copyText : copy.download}
    </button>
  )
}

export function Toolbar({ site, sites, onSite, look, set, metrics }: Props) {
  const post = look.template === 'post'
  const nextTheme = look.theme === 'dark' ? 'light' : 'dark'
  const ThemeIcon = look.theme === 'dark' ? Moon : Sun
  return (
    <div className="sd-toolbar">
      <label className="sd-site" title={copy.site}>
        <SiteMark site={site} size={20} />
        <select value={site.id} aria-label={copy.site} onChange={(e) => onSite(e.target.value)}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.domain}
            </option>
          ))}
        </select>
      </label>
      {metrics.length > 1 && (
        <div className="seg small" role="group" aria-label={copy.metric}>
          {metrics.map((m) => (
            <button key={m} type="button" aria-pressed={look.metric === m} onClick={() => set({ metric: m })}>
              {copy.metrics[m]}
            </button>
          ))}
        </div>
      )}
      {!post && (
        <>
          <button type="button" className="btn icon sd-tool" title={copy[look.theme]} aria-label={copy[nextTheme]} onClick={() => set({ theme: nextTheme })}>
            <ThemeIcon size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <div className="sd-swatches" role="radiogroup" aria-label={copy.accent}>
            {accentsFor(site.color).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={look.accent === c} aria-label={c} className="sd-swatch" style={{ background: c }} onClick={() => set({ accent: c })} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
