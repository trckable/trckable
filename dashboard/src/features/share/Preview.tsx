// The card as the server draws it: the very file Download saves. A post is
// its text, as it will be pasted.
import { useState } from 'react'
import { cardUrl, type CardWords, type Look } from './card'
import { copy } from './copy'

export function Preview({ site, look, words }: { site: string; look: Look; words: CardWords | null }) {
  const src = cardUrl(site, look)
  const [shown, setShown] = useState('')
  const [failed, setFailed] = useState('')
  if (look.template === 'post')
    return (
      <div className="sd-preview is-post">
        <p className="sd-post">{words?.post ?? ''}</p>
      </div>
    )
  return (
    <div className={'sd-preview' + (shown === src ? '' : ' is-loading')}>
      {failed === src && <span className="faint">{copy.failed}</span>}
      {failed !== src && (
        <img src={src} width={1200} height={630} alt={copy.previewAlt(copy.template[look.template].name)} onLoad={() => setShown(src)} onError={() => setFailed(src)} />
      )}
    </div>
  )
}
