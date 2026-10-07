// A milestone, reached: the ghost does a short celebration standing on the
// card's top edge (under 1.5 s, nothing at all with reduced motion) and a flat
// side card says what was reached: the number, one line of context, the card
// the server draws for sharing, Copy image and Share….
// One chunk of its own, fetched after the milestones arrive.
import { Flag } from 'lucide-react'
import { useState } from 'react'
import { SideCard } from '../../components/SideCard/SideCard'
import { Ghost } from '../../components/Logo'
import { toast } from '../../components/Toast'
import { fail, type Milestone } from '../../lib/api'
import { fmtDay } from '../../lib/dates'
import { reducedMotion } from '../../lib/motion'
import { useSettled } from '../../lib/settle'
import { copy } from './copy'
import { copyImage, shareApi } from './share'
import { Rolling } from '../moments/Rolling'
import { contextLine, say, showsBig, value } from './words'
import './Celebration.css'

export const SPARKS = 6

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
  /** This person sees revenue: the picture shows the amount too. */
  revenue?: boolean
  onShare: () => void
  onClose: () => void
}

export function Celebration({ m, list = [], site, domain = site, revenue = true, onShare, onClose }: Props) {
  const w = say(m)
  const settled = useSettled()
  const line = contextLine(m, list)
  // What the picture shows is what Copy image copies; the amount of revenue only to someone who may see it.
  const pic = (format: 'png' | 'svg') => shareApi.cardURL(site, m, { format, theme: 'dark', amount: m.kind === 'revenue' && showsBig(m, revenue) })
  // Revenue with its line already says "in revenue": the small word would say it twice.
  const label = m.kind === 'revenue' && line ? null : w.label
  return (
    <SideCard
      id="milestone"
      label={copy.newMilestone}
      closeLabel={copy.dismiss}
      kind={{ icon: <Flag size={14} strokeWidth={2} />, label: `${copy.kind} · ${domain}`, tint: w.money ? 'var(--money)' : 'var(--accent)' }}
      when={{ text: copy.today, title: fmtDay(m.day, { weekday: true }) }}
      flat
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
      <svg className="ms-line" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
        <polyline fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" points="0,26 18,22 32,24 48,17 62,19 80,11 100,4" />
      </svg>
      {line && <p className="ms-context">{line}</p>}
      {/* The picture is asked for once the page has had its moment; its room is kept. */}
      <img className="ms-peek" src={settled ? pic('svg') : undefined} width={1200} height={630} alt={copy.card} />
    </SideCard>
  )
}
