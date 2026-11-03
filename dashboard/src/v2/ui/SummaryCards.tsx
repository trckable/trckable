// The one summary card: a small uppercase label, the number under it, one muted line under that (the change, then what it is against).
// Every row of number tiles above a table or a page uses this, so they all look the same.
import type { ReactNode } from 'react'
import { RollText } from './RollText'
import type { Tone } from '../explore/types'
import './summary.css'

export interface SumItem {
  key: string
  label: ReactNode
  val: string
  unit?: string
  /** The change against before, shown first in the line under the number. */
  tag?: string
  tone?: Tone
  /** What the number is of or against. */
  sub?: string
  /** A country's flag shown before the number. */
  flag?: ReactNode
  /** Where the score sits from good to poor, 0 to 1. */
  at?: number
  /** The value in full, when it is shortened. */
  title?: string
  onClick?: () => void
  data?: string
}

const ARROW = { '': '', up: '↑ ', dn: '↓ ' }

function Body({ k }: { k: SumItem }) {
  return (
    <>
      <div className="sum-l" title={typeof k.label === 'string' ? k.label : undefined}>{k.label}</div>
      <div className="sum-v" title={k.title}>
        {k.flag}
        <RollText text={k.val} />
        {k.unit && <small>{k.unit}</small>}
      </div>
      {k.at !== undefined && (
        <div className="sum-g" aria-hidden="true">
          <i /><i /><i />
          <b style={{ left: `${k.at * 100}%` }} />
        </div>
      )}
      {(k.tag || k.sub) && (
        <div className="sum-d">
          {k.tag && <span className={`sum-n ${k.tone ?? ''}`}>{ARROW[k.tone ?? ''] + k.tag}</span>}
          {k.sub}
        </div>
      )}
    </>
  )
}

export function SummaryCards({ items }: { items: SumItem[] }) {
  return (
    <div className="xkw">
      <div className="sumrow">
        {items.map((k) =>
          k.onClick ? (
            <button key={k.key} type="button" className={`sum tap ${k.tone === 'dn' ? 'dn' : ''}`} data-sum={k.data} onClick={k.onClick}>
              <Body k={k} />
            </button>
          ) : (
            <div key={k.key} className={`sum ${k.tone === 'dn' ? 'dn' : ''}`} data-sum={k.data}>
              <Body k={k} />
            </div>
          ),
        )}
      </div>
    </div>
  )
}
