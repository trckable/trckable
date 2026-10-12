// Why visitors leave after one page, and what to try: the rate, the rows that
// explain it, at most two suggestions chosen by fixed rules. Opened from a
// site's bounce pill in the Sites list and from the Story card; loaded only
// then. Everything in it was counted; the suggestions are rules, not guesses.
import { X } from 'lucide-react'
import { Modal } from '../../kit/Modal'
import { fmtDay } from '../../lib/dates'
import { fmtFixed, fmtPct } from '../../lib/format'
import type { BounceCause, BounceGuide } from '../../lib/apiMore'
import { PathChip } from '../signals/PathChip'
import { channelLabel } from '../../lib/palette'
import { copy } from './copy'
import { seePage } from './seePage'
import { triesOf, topPage } from './tries'
import { useBounceGuide } from './useBounceGuide'
import './bounce.css'

type Props = {
  site: string
  /** The site's address: "See this page" opens Data there. */
  domain: string
  /** rangeQS(query) or "?days=30". */
  qs: string
  onClose: () => void
}

function Cause({ c, onSee }: { c: BounceCause; onSee: (page: string) => void }) {
  const stat = c.was === null ? copy.leaveHere(fmtPct(c.rate)) : copy.leaveHereWas(fmtPct(c.rate), fmtPct(c.was))
  return (
    <li className="bg-cause">
      <span className="bg-lead">
        {c.kind === 'page' && (
          <>
            {copy.pageLead} <PathChip page={c.label} onPick={() => onSee(c.label)} />
          </>
        )}
        {c.kind === 'source_device' && copy.sourceLead(channelLabel(c.source ?? ''), c.device ?? '')}
        {c.kind === 'speed' && copy.speedLead(fmtFixed((c.lcp_ms ?? 0) / 1000, 1))}
      </span>
      <span className="bg-stat muted">
        {stat} · {copy.ofVisits(fmtPct(c.share_of_visits))}
      </span>
    </li>
  )
}

function Body({ g, onSee }: { g: BounceGuide; onSee: (page: string) => void }) {
  if (g.direction === 'normal') return <p className="bg-note muted">{copy.normal(fmtPct(g.usual))}</p>
  if (g.direction === 'low') return <p className="bg-note muted">{copy.low}</p>
  const tries = triesOf(g.causes)
  return (
    <>
      {g.causes.length === 0 ? (
        <p className="bg-note muted">{copy.spread}</p>
      ) : (
        <ul className="bg-causes">
          {g.causes.map((c) => (
            <Cause key={c.kind + c.label} c={c} onSee={onSee} />
          ))}
        </ul>
      )}
      {tries.length > 0 && (
        <section className="bg-try" aria-label={copy.tryTitle}>
          <h3>{copy.tryTitle}</h3>
          <ul>
            {tries.map((k) => (
              <li key={k}>{copy.tries[k]}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

export default function BounceGuideModal({ site, domain, qs, onClose }: Props) {
  const onSee = (page: string) => {
    onClose()
    seePage(domain, page)
  }
  const { guide, state } = useBounceGuide(site, qs)
  const page = guide ? topPage(guide.causes) : null
  return (
    <Modal label={copy.label} onClose={onClose} className="surge-modal bounce-modal" keepSize={false} focus="box">
      <button type="button" className="sgm-x" aria-label={copy.close} onClick={onClose}>
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {state === 'loading' && (
        <p className="muted" role="status">
          {copy.loading}
        </p>
      )}
      {state === 'failed' && (
        <p className="muted" role="status">
          {copy.failed}
        </p>
      )}
      {guide && (
        <>
          <header className="sgm-hero bg-hero">
            <b className="bg-rate">{fmtPct(guide.rate)}</b>
            <span className="sgm-meta">
              <span className="bg-leave">{copy.leave(fmtPct(guide.usual))}</span>
              {guide.since && <span className="sg-chip bg-since">{copy.since(fmtDay(guide.since))}</span>}
            </span>
          </header>
          <Body g={guide} onSee={onSee} />
          {page && (
            <div className="sgm-actions">
              <button type="button" className="btn primary" onClick={() => onSee(page)}>
                {copy.seePage}
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
