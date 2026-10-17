// A milestone, reached: the ghost does a short celebration standing on the
// card's top edge (under 1.5 s, nothing at all with reduced motion) and a flat
// side card says what was reached: the number, one line of context, the card
// the server draws for sharing is not drawn here (Copy image and Share… have it): the card stays small, and
// puts itself away after a while unless the pointer or the keyboard is on it.
// One chunk of its own, fetched after the milestones arrive.
import { Flag } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SideCard, useCardClose } from '../../components/SideCard/SideCard'
import { Ghost } from '../../components/Logo'
import { toast } from '../../components/Toast'
import { fail, type Milestone } from '../../lib/api'
import { fmtDay } from '../../lib/dates'
import { reducedMotion } from '../../lib/motion'
import { copy } from './copy'
import { copyImage, shareApi } from './share'
import { Rolling } from '../moments/Rolling'
import { contextLine, say, value } from './words'
import './Celebration.css'

export const SPARKS = 6
/** How long the card stays up on its own. */
export const STAY_MS = 12_000

/** Puts the card away after STAY_MS, a clock that stops while the pointer or the focus is on it. */
function AutoLeave() {
  const leave = useCardClose()
  const go = useRef(leave)
  useEffect(() => {
    go.current = leave
  })
  const [mark, setMark] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const card = mark?.closest('.side-card')
    if (!card) return
    let t: ReturnType<typeof setTimeout> | undefined
    const start = () => {
      clearTimeout(t)
      t = setTimeout(() => go.current(), STAY_MS)
    }
    const stop = () => clearTimeout(t)
    const out = () => !card.matches(':hover, :focus-within') && start()
    card.addEventListener('pointerenter', stop)
    card.addEventListener('pointerleave', out)
    card.addEventListener('focusin', stop)
    card.addEventListener('focusout', out)
    start()
    return () => {
      stop()
      card.removeEventListener('pointerenter', stop)
      card.removeEventListener('pointerleave', out)
      card.removeEventListener('focusin', stop)
      card.removeEventListener('focusout', out)
    }
  }, [mark])
  return <span ref={setMark} hidden />
}

/** The ghost hops up on the card's top edge, with a few sparks. Drawn once, then gone. */
function Party({ money }: { money: boolean }) {
  const [shown, setShown] = useState(!reducedMotion())
  if (!shown) return null
  return (
    <div className={money ? 'ms-party money' : 'ms-party'} aria-hidden="true" onAnimationEnd={(e) => e.target === e.currentTarget && setShown(false)}>
      <Ghost size={56} />
      {Array.from({ length: SPARKS }, (_, i) => (
        <i key={i} style={{ ['--i' as string]: i }} />
      ))}
    </div>
  )
}

interface Props {
  m: Milestone
  /** The site's milestones, for the line of context. */
  list?: Milestone[]
  site: string
  domain?: string
  onShare: () => void
  onClose: () => void
}

export function Celebration({ m, list = [], site, domain = site, onShare, onClose }: Props) {
  const w = say(m)
  const line = contextLine(m, list)
  // What the picture shows is what Copy image copies, and "Show amount" starts off: the amount of revenue is never in it here.
  const pic = (format: 'png' | 'svg') => shareApi.cardURL(site, m, { format, theme: 'dark', amount: false })
  // Revenue with its line already says "in revenue": the small word would say it twice.
  const label = m.kind === 'revenue' && line ? null : w.label
  return (
    <SideCard
      id="milestone"
      label={copy.newMilestone}
      closeLabel={copy.dismiss}
      kind={{ icon: <Flag size={14} strokeWidth={2} />, label: `${copy.kind} · ${domain}`, tint: w.money ? 'var(--money)' : 'var(--accent)' }}
      when={{ text: copy.today, title: fmtDay(m.day, { weekday: true }) }}
      crown={<Party money={w.money} />}
      title={
        <span className="side-num num">
          {w.big && w.n ? <Rolling to={w.n} fmt={(n) => value(m.kind, n, m.currency)} /> : w.big}
          {label && <small>{label}</small>}
        </span>
      }
      onClose={onClose}
      actions={
        <>
          <AutoLeave />
          {typeof ClipboardItem !== 'undefined' && (
            <button type="button" className="btn" onClick={() => copyImage(pic('png')).then(() => toast(copy.imageCopied), (e: unknown) => fail(e))}>
              {copy.copyImage}
            </button>
          )}
          <button type="button" className="btn primary ms-share" onClick={onShare}>
            {copy.shareMore}
          </button>
        </>
      }
    >
      {line && <p className="ms-context">{line}</p>}
    </SideCard>
  )
}
