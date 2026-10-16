// What a section says while it has nothing to read yet: a blurred sample of what it would show, under a lock, with the
// one thing to do (connect it) and how it works.
import { useId, type CSSProperties } from 'react'

export interface LockText {
  title: string
  line: string
  hint: string
  button: string
  how: string
  tag: string
}

export interface LockLine {
  name?: string
  value: string
  bar?: number
}

export interface LockSample {
  big: string
  lines: LockLine[]
}

const w = (n?: number): CSSProperties | undefined => (n ? { width: n } : undefined)

export function XLock({ text, sample, onSet, onHow }: { text: LockText; sample: LockSample; onSet: () => void; onHow: () => void }) {
  const id = useId()
  return (
    <section className="lkc big">
      <span className="lkc-tag">{text.tag}</span>
      <div className="lkc-s" aria-hidden="true">
        <h4>{text.title}</h4>
        <div className="bg">{sample.big}</div>
        {sample.lines.map((l) => (
          <div key={l.name} className="ln">
            {l.name}
            {l.bar && <i style={w(l.bar)} />}
            <b>{l.value}</b>
          </div>
        ))}
      </div>
      <div className="lkc-o" role="region" aria-labelledby={id}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <p className="lt1" id={id}>
          {text.line}
        </p>
        <p className="lt2">{text.hint}</p>
        <button type="button" className="lkgo" onClick={onSet}>
          {text.button}
        </button>
        <button type="button" className="lk3 how" onClick={onHow}>
          {text.how}
        </button>
      </div>
    </section>
  )
}
