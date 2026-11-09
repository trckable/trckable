// The look: which site, light or dark, the accent, and trckable's name (a free plan cannot take it off).
import { Select } from '../../components/Select'
import { SiteMark } from '../../components/SiteMark'
import { Switch } from '../../components/Switch'
import type { Site } from '../../lib/api'
import { accentsFor, type Look } from './card'
import { copy } from './copy'
import type { Look as SiteLook } from './useLook'

type Props = { site: Site; sites: Site[]; onSite: (id: string) => void; look: Look; set: (l: Partial<Look>) => void; brand: SiteLook }

export function LookSection({ site, sites, onSite, look, set, brand }: Props) {
  const post = look.template === 'post'
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
      {!post && (
        <>
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
          {brand.look && !brand.look.brand_locked && (
            <div className="sd-row">
              <span>{copy.hideBrand}</span>
              <Switch on={brand.look.hide_brand} label={copy.hideBrand} onChange={brand.edit.flip} />
            </div>
          )}
        </>
      )}
    </>
  )
}
