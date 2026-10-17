// Why visitors leave after one page, as a walkthrough: what happened, where
// they leave, why, and what to try. Opened from a site's bounce pill in the
// Sites list and from the Story card; loaded only then. Everything shown was
// counted; the things to try are rules, not guesses.
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Modal } from '../../kit/Modal'
import { fmtPct } from '../../lib/format'
import type { BounceGuide } from '../../lib/apiMore'
import { copy, useBounceGuide } from './b'
import { seePage, seeSpeed } from './seePage'
import { StepFix } from './StepFix'
import { StepWhat } from './StepWhat'
import { StepWhere } from './StepWhere'
import { StepWhy } from './StepWhy'
import './bounce.css'

type Props = {
  site: string
  /** The site's address: the fixes open it, and Data there. */
  domain: string
  /** rangeQS(query) or "?days=30". */
  qs: string
  onClose: () => void
}

const STEPS = 4

/** Whether there is a story to walk through: visitors leave more than usual and something explains it. */
const walks = (g: BounceGuide) => g.direction === 'high' && g.causes.length > 0

function noteOf(g: BounceGuide): string {
  if (g.direction === 'few') return copy.few(g.min_sessions, g.weeks)
  if (g.direction === 'normal' && g.usual !== null) return copy.normal(fmtPct(g.usual))
  return g.direction === 'low' ? copy.low : copy.spread
}

function Walk({ g, site, domain, onClose }: { g: BounceGuide; site: string; domain: string; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const next = useRef<HTMLButtonElement>(null)
  const go = (n: number) => setStep(Math.min(STEPS - 1, Math.max(0, n)))
  const last = step === STEPS - 1
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowRight') setStep((n) => Math.min(STEPS - 1, n + 1))
      if (e.key === 'ArrowLeft') setStep((n) => Math.max(0, n - 1))
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [])
  // A disabled Back would drop focus out of the card: keep it on Next.
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) next.current?.focus()
  }, [step])
  const leaveTo = (to: () => void) => {
    onClose()
    to()
  }
  const onSee = (page: string) => leaveTo(() => seePage(domain, page))
  const onSpeed = (page: string) => leaveTo(() => seeSpeed(domain, page))
  return (
    <>
      <nav className="bg-dots" aria-label={copy.steps}>
        {copy.titles.map((t, i) => (
          <button key={t} type="button" className="bg-dot" aria-label={t} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)} />
        ))}
        <span className="muted">{copy.stepOf(step + 1, STEPS)}</span>
      </nav>
      <h2 className="bg-title">{copy.titles[step]}</h2>
      <div className="bg-stage" key={step} aria-live="polite">
        {step === 0 && <StepWhat g={g} />}
        {step === 1 && <StepWhere causes={g.causes} onSee={onSee} />}
        {step === 2 && <StepWhy causes={g.causes} />}
        {step === 3 && <StepFix site={site} domain={domain} causes={g.causes} onSee={onSee} onSpeed={onSpeed} />}
      </div>
      <footer className="bg-nav">
        <button type="button" className="btn" disabled={step === 0} onClick={() => go(step - 1)}>
          {copy.back}
        </button>
        <button ref={next} type="button" className="btn primary" onClick={() => (last ? onClose() : go(step + 1))}>
          {last ? copy.done : copy.next}
        </button>
      </footer>
    </>
  )
}

export default function BounceGuideModal({ site, domain, qs, onClose }: Props) {
  const { guide, state } = useBounceGuide(site, qs)
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
      {guide && walks(guide) && <Walk g={guide} site={site} domain={domain} onClose={onClose} />}
      {guide && !walks(guide) && (
        <>
          <StepWhat g={guide} />
          <p className="bg-note muted">{noteOf(guide)}</p>
        </>
      )}
    </Modal>
  )
}
