// The mini dashboard under the first step: the domain appears in it as it is typed.
import { SiteMark } from '../../components/SiteMark'
import { copy } from './copy'

function Tile({ label }: { label: string }) {
  return (
    <div className="ob-tile">
      <span className="faint">{label}</span>
      <b className="num">{copy.preview.none}</b>
    </div>
  )
}

export function Preview({ domain }: { domain: string }) {
  const shown = domain || copy.preview.empty
  return (
    <figure className="ob-preview" aria-label={copy.preview.label(shown)}>
      <div className="ob-preview-head">
        <SiteMark site={{ domain: shown }} size={24} />
        <b className={domain ? 'ob-domain' : 'ob-domain faint'}>{shown}</b>
        <span className="ob-tag">{copy.preview.sample}</span>
      </div>
      <div className="ob-tiles">
        <Tile label={copy.preview.visitors} />
        <Tile label={copy.preview.pageviews} />
        <Tile label={copy.preview.online} />
      </div>
      <figcaption className="faint">{copy.preview.waiting}</figcaption>
    </figure>
  )
}
