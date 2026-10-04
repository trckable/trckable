// A small picture of the page a link opens, beside the controls that shape
// it: the header with the logo, colour and branding the owner chose, the
// first numbers as bars, and the address in a bar above it. It draws the same
// state as the Look panel, so a change shows before it is even saved. With
// nothing set it is trckable's own look.
import type { CSSProperties } from 'react'
import type { Site } from '../../lib/api'
import { Ghost, Name, Wordmark } from '../../components/Logo'
import { SiteMark } from '../../components/SiteMark'
import { accentVars } from '../../views/shareAccent'
import { copy } from './copy'
import type { Look } from './useLook'

const BARS = [38, 52, 44, 70, 58, 82, 66, 90, 74, 96]

export function LinkPreview({ site, state }: { site: Site; state: Look }) {
  const { look, domain } = state
  const logo = look?.logo_url ?? ''
  const hide = look?.hide_brand ?? false
  const host = domain.trim() || (globalThis.location?.host ?? '')
  const mark = look?.color || site.color
  return (
    <figure className="sd-pv" role="img" aria-label={copy.preview} style={accentVars(look?.color)}>
      <div className="sd-pv-bar" aria-hidden="true">
        <span className="sd-pv-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="sd-pv-url">
          {host}
          <span className="faint">{copy.previewPath}</span>
        </span>
      </div>
      <div className="sd-pv-page" aria-hidden="true">
        <div className="sd-pv-head">
          {logo && <img className="sd-pv-logo" src={logo} alt="" />}
          {!logo && !hide && <Wordmark />}
          <span className="sd-pv-id">
            <SiteMark site={{ domain: site.domain, color: mark, icon_url: site.icon_url }} size={20} />
            <span className="sd-pv-who">
              <b>{site.name || site.domain}</b>
              <span className="faint">{copy.previewSample}</span>
            </span>
          </span>
          {logo && !hide && (
            <span className="faint sd-pv-credit">
              <Ghost size={14} /> <Name />
            </span>
          )}
        </div>
        <div className="sd-pv-tiles">
          {copy.tiles.map((t, i) => (
            <span key={t} className={i === 0 ? 'sd-pv-tile on' : 'sd-pv-tile'}>
              <span className="faint">{t}</span>
              <i style={{ width: `${46 - i * 6}%` }} />
            </span>
          ))}
        </div>
        <div className="sd-pv-chart">
          {BARS.map((h, i) => (
            <i key={i} style={{ '--h': `${h}%` } as CSSProperties} />
          ))}
        </div>
      </div>
    </figure>
  )
}
