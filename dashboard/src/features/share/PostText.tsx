// The post under the picture: written from the card, a person's own words once they edit it. X counts it with the link.
import { useId } from 'react'
import { X_MAX, chars, xLength } from './post'
import { copy } from './copy'
import { postCopy } from './postCopy'
import type { Place } from './places'

type Props = { place: Place; text: string; /** A person's own words are there: the written post can be brought back. */ edited: boolean; onChange: (t: string) => void; onReset: () => void }

export function PostText({ place, text, edited, onChange, onReset }: Props) {
  const id = useId()
  const x = place === 'x'
  const count = xLength(text)
  return (
    <div className="sd-post">
      <div className="sd-post-head">
        <span className="sd-post-name">
          <label htmlFor={id}>{copy.postText}</label>
          {edited && (
            <button type="button" className="sd-reset" onClick={onReset}>
              {postCopy.reset}
            </button>
          )}
        </span>
        <span className={x && count > X_MAX ? 'sd-over' : ''}>{x ? copy.xCount(count, X_MAX) : copy.characters(chars(text))}</span>
      </div>
      <textarea id={id} rows={Math.min(7, Math.max(2, text.split('\n').length))} value={text} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
