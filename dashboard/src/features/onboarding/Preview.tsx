// The mini dashboard beside every step: the domain appears in it as it is
// typed, and the first visits fill it in once they land.
import { SiteMark } from '../../components/SiteMark'
import type { Visit } from '../../lib/api'
import { countryName } from '../../lib/format'
import { copy } from './copy'
import { tally } from './model'

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="ob-tile">
      <span className="faint">{label}</span>
      <b className="num">{value}</b>
    </div>
  )
}

export function Preview({ domain, visits }: { domain: string; visits: Visit[] }) {
  const shown = domain || copy.preview.empty
  const live = visits.length > 0
  const t = tally(visits)
  const num = (n: number) => (live ? copy.count(n) : copy.preview.none)
  return (
    <figure className="ob-preview" aria-label={copy.preview.label(shown)}>
      <div className="ob-preview-head">
        <SiteMark site={{ domain: shown }} size={24} />
        <b className={domain ? 'ob-domain' : 'ob-domain faint'}>{shown}</b>
        <span className={live ? 'ob-tag live' : 'ob-tag'}>{live ? copy.preview.live : copy.preview.sample}</span>
      </div>
      <div className="ob-tiles">
        <Tile label={copy.preview.visitors} value={num(t.visitors)} />
        <Tile label={copy.preview.pageviews} value={num(t.pageviews)} />
        <Tile label={copy.preview.online} value={num(live ? 1 : 0)} />
      </div>
      {live ? (
        <ol className="ob-feed" aria-live="polite">
          {visits.slice(0, 4).map((v) => (
            <li key={`${v.ts}-${v.path ?? v.goal ?? ''}`}>
              <span className="pulse" aria-hidden="true" />
              {copy.preview.opened(v.country ? countryName(v.country) : '', v.path ?? '/')}
            </li>
          ))}
        </ol>
      ) : (
        <figcaption className="faint">{copy.preview.waiting}</figcaption>
      )}
    </figure>
  )
}
