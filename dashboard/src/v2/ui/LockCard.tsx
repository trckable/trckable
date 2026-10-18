// A locked preview, copied from the walkthrough: a blurred sample of what a feature would show (not in Explore, which holds the reader's own figures), under one line on why and
// the one button that sets it up. In the Briefing's grid, in Explore (big) and in Live (mini): one card, three sizes.
import { useId, type ReactNode } from 'react'
import { lockCopy, type LockKind } from './lockCopy'

export interface LockCardProps {
  kind: LockKind
  size?: 'card' | 'big' | 'mini'
  /** The button (what the feature asks for: "Connect", "Turn on"). */
  go: string
  onGo: () => void
  onHow: () => void
}

const Line = ({ children, bar, first }: { children?: ReactNode; bar?: number | string; first?: boolean }) => {
  const b = bar === undefined ? null : <i style={typeof bar === 'number' ? { width: bar } : { width: bar, height: 14 }} />
  return (
    <div className="ln">
      {first && b}
      {children}
      {!first && b}
    </div>
  )
}

function Sample({ kind }: { kind: LockKind }) {
  const c = lockCopy
  switch (kind) {
    case 'rev':
      return (
        <>
          <div className="bg">{c.revBig}</div>
          {[
            [90, '$2,140'],
            [60, '$1,310'],
            [40, '$870'],
          ].map(([w, v], i) => (
            <Line key={i} bar={w as number} first>
              {c.revRows[i]}
              <b>{v}</b>
            </Line>
          ))}
        </>
      )
    case 'search':
      return (
        <>
          <div className="bg">{c.searchBig}</div>
          {['312', '204', '118'].map((v, i) => (
            <Line key={i}>
              {c.searchRows[i]}
              <b>{v}</b>
            </Line>
          ))}
        </>
      )
    case 'goals':
      return (
        <>
          <div className="bg">{c.goalsBig}</div>
          {[
            [120, '42'],
            [70, '18'],
            [40, '9'],
          ].map(([w, v], i) => (
            <Line key={i} bar={w as number}>
              {c.goalsRows[i]}
              <b>{v}</b>
            </Line>
          ))}
        </>
      )
    case 'uptime':
      return (
        <>
          <div className="bg">{c.uptimeBig}</div>
          <Line bar="100%" />
          <Line>
            {c.uptimeLast}
            <b>{c.uptimeNone}</b>
          </Line>
        </>
      )
    default:
      return (
        <>
          {c.alertsRows.map((t) => (
            <Line key={t}>
              {t}
              <span className="tg2" />
            </Line>
          ))}
        </>
      )
  }
}

export function LockCard({ kind, size = 'card', go, onGo, onHow }: LockCardProps) {
  const id = useId()
  const c = lockCopy
  const text = { title: c[`${kind}Title`], line: c[`${kind}Line`], sub: c[`${kind}Sub`] }
  // In Explore (big) it is the reader's own figures that are missing, so no blurred example numbers stand where they will be.
  const sampled = size !== 'big'
  return (
    <section className={`lkc${size === 'card' ? '' : ` ${size}`}`} data-lock={kind}>
      {sampled && <span className="lkc-tag">{c.sample}</span>}
      {sampled && (
        <div className="lkc-s" aria-hidden="true">
          <h4>{text.title}</h4>
          <Sample kind={kind} />
        </div>
      )}
      <div className="lkc-o" role="region" aria-labelledby={id}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <p className="lt1" id={id}>
          {text.line}
        </p>
        <p className="lt2">{text.sub}</p>
        <button type="button" className="lkgo" onClick={onGo}>
          {go}
        </button>
        <button type="button" className="lk3 how" onClick={onHow}>
          {c.how}
        </button>
      </div>
    </section>
  )
}
