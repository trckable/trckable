// The look: which site, light or dark, the accent, and trckable's name (a free plan cannot take it off).
import { Select } from '../../components/Select'
import { SiteMark } from '../../components/SiteMark'
import { Switch } from '../../components/Switch'
import type { Site } from '../../lib/api'
import { BACKGROUNDS, FORMATS, accentsFor, type Look } from './card'
import { copy } from './copy'
import type { Look as SiteLook } from './useLook'

type Props = { site: Site; sites: Site[]; onSite: (id: string) => void; look: Look; set: (l: Partial<Look>) => void; brand: SiteLook }

/** A small outline of the picture's shape: its ratio, drawn in a 16 px box. */
function ShapeIcon({ w, h }: { w: number; h: number }) {
  const k = 14 / Math.max(w, h)
  return (
    <svg className="sd-shape" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x={8 - (w * k) / 2} y={8 - (h * k) / 2} width={w * k} height={h * k} rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function LookSection({ site, sites, onSite, look, set, brand }: Props) {
  return (
    <>
      {sites.length > 1 && (
        <Select className="sd-site" mark={<SiteMark site={site} size={20} />} value={site.id} title={copy.site} aria-label={copy.site} onChange={(e) => onSite(e.target.value)}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.domain}
            </option>
          ))}
        </Select>
      )}
      <div className="sd-chips" role="radiogroup" aria-label={copy.shape}>
        {FORMATS.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={look.shape === f.id} className="sd-chip" title={copy.shapes[f.id].hint} onClick={() => set({ shape: f.id })}>
            <ShapeIcon w={f.w} h={f.h} />
            {copy.shapes[f.id].name}
          </button>
        ))}
      </div>
      <div className="sd-chips" role="radiogroup" aria-label={copy.lookTitle}>
        {(['dark', 'light'] as const).map((th) => (
          <button key={th} type="button" role="radio" aria-checked={look.theme === th} className="sd-chip" onClick={() => set({ theme: th })}>
            {copy[th]}
          </button>
        ))}
      </div>
      <div className="sd-swatches" role="radiogroup" aria-label={copy.accent}>
        {accentsFor(site.color).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={look.accent === c} aria-label={c} className="sd-swatch" style={{ backgroundColor: c }} onClick={() => set({ accent: c })} />
        ))}
      </div>
      <div className="sd-chips" role="radiogroup" aria-label={copy.background}>
        {BACKGROUNDS.map((b) => (
          <button key={b} type="button" role="radio" aria-checked={(look.bg ?? 'gradient') === b} className="sd-chip" onClick={() => set({ bg: b })}>
            {copy.backgrounds[b]}
          </button>
        ))}
      </div>
      <div className="sd-row">
        <span>{copy.showDate}</span>
        <Switch on={!look.hideDate} label={copy.showDate} onChange={() => set({ hideDate: !look.hideDate })} />
      </div>
      <div className="sd-row">
        <span>{copy.showName}</span>
        <Switch on={!look.hideName} label={copy.showName} onChange={() => set({ hideName: !look.hideName })} />
      </div>
      {brand.look && !brand.look.brand_locked && (
        <div className="sd-row">
          <span>{copy.hideBrand}</span>
          <Switch on={brand.look.hide_brand} label={copy.hideBrand} onChange={brand.edit.flip} />
        </div>
      )}
    </>
  )
}
