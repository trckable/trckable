// Picture or text post: the picture as an image to download, or its words to paste.
import type { Mode } from './card'
import { copy } from './copy'

const MODES: Mode[] = ['picture', 'text']

export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="sd-chips sd-mode" role="radiogroup" aria-label={copy.kind}>
      {MODES.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} className="sd-chip" onClick={() => onChange(m)}>
          {copy.kinds[m]}
        </button>
      ))}
    </div>
  )
}
