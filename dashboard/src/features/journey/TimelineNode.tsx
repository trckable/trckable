// One step of a visit: a page (folded when viewed again in a row), a goal or
// a payment. Pages say when they were reached and how long the visitor stayed.
import { CircleDollarSign, Target } from 'lucide-react'
import { fmtDuration, fmtMoney } from '../../lib/format'
import { truncateMiddle } from '../../lib/visitor'
import { SourceMark } from '../../components/visitor/SourceMark'
import { copy } from './copy'
import type { PageNode, Prop, StoryNode } from './model'
import type { OnFilter } from './SourceChip'
import { fmtTime, isoOf } from './when'

function When({ at, offset, first, zone }: { at: number; offset: number; first: boolean; zone?: string }) {
  const text = first ? fmtTime(at, zone) : copy.offset(fmtDuration(offset))
  return (
    <time className="jr-when num" dateTime={isoOf(at)} title={fmtTime(at, zone)}>
      {text}
    </time>
  )
}

// A value that is a bare site address gets its own mark.
const SITE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i
const siteOf = (v: string) => (SITE.test(v) ? v.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0] : '')

function Props({ props }: { props: Prop[] }) {
  return (
    <span className="jr-props">
      {props.map((p) => {
        const site = siteOf(p.value)
        return (
          <span key={p.key} className="jr-prop faint">
            {site && <SourceMark channel="Referral" referrer={site} size={14} />}
            <span>{copy.prop(p.key === 'form' ? copy.formKey : p.key, p.value)}</span>
          </span>
        )
      })}
    </span>
  )
}

function PageBody({ n, here, onFilter }: { n: PageNode; here: boolean; onFilter?: OnFilter }) {
  const short = truncateMiddle(n.path || '/')
  const path = onFilter ? (
    <button type="button" className="jr-path num" title={copy.filterPage(n.path)} onClick={() => onFilter({ kind: 'page', value: n.path }, n.at)}>
      {short}
    </button>
  ) : (
    <span className="jr-path num" title={n.path}>
      {short}
    </span>
  )
  return (
    <div className="jr-node-main">
      {path}
      {n.count > 1 && (
        <span className="jr-times num" title={copy.timesLabel(n.count)} aria-label={copy.timesLabel(n.count)}>
          {copy.times(n.count)}
        </span>
      )}
      {here && <span className="jr-tag here">{copy.here}</span>}
      {!here && n.exit && <span className="jr-tag">{copy.exit}</span>}
    </div>
  )
}

function nodeClass(n: StoryNode, here: boolean): string {
  if (n.kind !== 'page') return 'jr-node ' + n.kind
  if (here) return 'jr-node page here'
  if (n.exit) return 'jr-node page exit'
  return 'jr-node page'
}

export function TimelineNode({ n, index, first, live, currency, zone, onFilter }: { n: StoryNode; index: number; first: boolean; live: boolean; currency: string; zone?: string; onFilter?: OnFilter }) {
  const here = live && n.kind === 'page' && n.exit
  return (
    <li className={nodeClass(n, here)} style={{ ['--i' as string]: String(Math.min(index, 12)) }}>
      <span className="jr-dot" aria-hidden="true" />
      {n.kind === 'page' && <PageBody n={n} here={here} onFilter={onFilter} />}
      {n.kind === 'goal' && (
        <div className="jr-node-main">
          <Target size={14} strokeWidth={2} aria-hidden="true" />
          <span className="jr-kind">{copy.goal}</span>
          <b className="jr-goal">{n.goal}</b>
          {n.props && <Props props={n.props} />}
        </div>
      )}
      {n.kind === 'payment' && (
        <div className="jr-node-main">
          <CircleDollarSign size={14} strokeWidth={2} aria-hidden="true" />
          <span className="jr-kind">{copy.payment}</span>
          <b className="jr-money num">{fmtMoney(n.amount, currency, 2)}</b>
          <span className="faint">{copy.via(n.provider)}</span>
          {n.refunded > 0 && <span className="faint num">{copy.refunded(fmtMoney(n.refunded, currency, 2))}</span>}
        </div>
      )}
      <span className="jr-meta">
        <When at={n.at} offset={n.offset} first={first} zone={zone} />
        {n.kind === 'page' && n.engagedS > 0 && <span className="faint num">{copy.stayed(fmtDuration(n.engagedS))}</span>}
      </span>
    </li>
  )
}
