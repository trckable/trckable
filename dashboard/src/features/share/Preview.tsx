// The card as the server draws it: the very file Download saves. A post is its text, as it will be pasted.
// The picture stands in a box of one size, whole (letterboxed); a new one fades in over the old, which stays until
// it has loaded, and only the very first one has a shimmer.
import { useState, type CSSProperties } from 'react'
import { cardUrl, formatOf, type CardWords, type Look } from './card'
import { copy } from './copy'

export function Preview({ site, look, words }: { site: string; look: Look; words: CardWords | null }) {
  const src = cardUrl(site, look)
  const { w, h } = formatOf(look.shape)
  const [cur, setCur] = useState('')
  const [old, setOld] = useState('')
  const [failed, setFailed] = useState('')
  if (look.template === 'post')
    return (
      <div className="sd-preview is-post">
        <p className="sd-post">{words?.post ?? ''}</p>
      </div>
    )
  const alt = copy.previewAlt(copy.template[look.template].name)
  return (
    <div className="sd-preview">
      <div className="sd-frame" style={{ '--r': w / h } as CSSProperties}>
        {failed === src && <span className="sd-failed faint">{copy.failed}</span>}
        {cur === '' && failed !== src && <span className="sd-skel" aria-hidden="true" />}
        {old && old !== cur && <img key={old} className="sd-img is-out" src={old} alt="" aria-hidden="true" />}
        {cur && <img key={cur} className="sd-img" src={cur} width={w} height={h} alt={alt} />}
        {src !== cur && failed !== src && (
          <img
            className="sd-img is-loader"
            src={src}
            alt=""
            aria-hidden="true"
            onLoad={() => {
              setOld(cur)
              setCur(src)
            }}
            onError={() => setFailed(src)}
          />
        )}
      </div>
    </div>
  )
}
