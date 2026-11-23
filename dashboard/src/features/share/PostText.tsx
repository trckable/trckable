// The post under the picture: written from the card, a person's own words once they edit it. X counts it with the link.
import { X_MAX, chars, xLength } from './post'
import { copy } from './copy'
import type { Place } from './places'

export function PostText({ place, text, onChange }: { place: Place; text: string; onChange: (t: string) => void }) {
  const x = place === 'x'
  const count = xLength(text)
  return (
    <label className="sd-post">
      <span className="sd-post-head">
        <span>{copy.postText}</span>
        <span className={x && count > X_MAX ? 'sd-over' : ''}>{x ? copy.xCount(count, X_MAX) : copy.characters(chars(text))}</span>
      </span>
      <textarea rows={2} value={text} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
