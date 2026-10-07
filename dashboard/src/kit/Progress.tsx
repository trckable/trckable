// A value, a pill ("almost there"), a bar in parts with a label under each, and
// chips for the next actions.
import type { ReactNode } from 'react'
import { Card } from './Card'
import { Pill } from './Pill'
import type { Tone } from './model'

export type Part = { key: string; label: ReactNode; weight: number; done?: boolean }
export type Action = { key: string; label: ReactNode; onClick: () => void }

export function Progress({ title, value, pill, parts, actions, className = '' }: { title: ReactNode; value: ReactNode; pill?: { text: ReactNode; tone?: Tone }; parts?: Part[]; actions?: Action[]; className?: string }) {
  return (
    <Card title={title} className={`kit-progress ${className}`}>
      <span className="kit-val">
        <b className="num">{value}</b>
        {pill && <Pill tone={pill.tone}>{pill.text}</Pill>}
      </span>
      {parts && parts.length > 0 && (
        <>
          <span className="kit-seg3" aria-hidden="true">
            {parts.map((p) => (
              <i key={p.key} className={p.done ? 'done' : ''} style={{ flex: p.weight }} />
            ))}
          </span>
          <span className="kit-seg3l">
            {parts.map((p) => (
              <span key={p.key} style={{ flex: p.weight }}>
                {p.label}
              </span>
            ))}
          </span>
        </>
      )}
      {actions && actions.length > 0 && (
        <span className="kit-acts">
          {actions.map((a) => (
            <button key={a.key} type="button" className="kit-act" onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </span>
      )}
    </Card>
  )
}
