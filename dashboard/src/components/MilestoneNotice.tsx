// A milestone the site just reached, said once above its numbers, with a
// way to share it as a picture. Dismissed, it never comes back.
import { PartyPopper, Share2, X } from 'lucide-react'
import type { Milestone } from '../lib/api'
import { fmtDay } from '../lib/dates'
import { fmtInt } from '../lib/format'
import './MilestoneNotice.css'

/** The words for a milestone: the big value, what it is, and when. */
export function milestoneWords(m: Milestone): { value: string; label: string; sub: string; line: string } {
  const on = `Reached on ${fmtDay(m.day)}`
  switch (m.kind) {
    case 'visitors':
      return { value: fmtInt(m.value), label: 'visitors, all time', sub: on, line: `You just passed ${fmtInt(m.value)} visitors` }
    case 'best_day':
      return { value: fmtInt(m.value), label: 'visitors in one day', sub: `The best day yet · ${fmtDay(m.day)}`, line: `Your best day yet: ${fmtInt(m.value)} visitors` }
    case 'first_ai':
      return { value: 'First', label: 'visitor sent by an AI assistant', sub: on, line: 'Your first visitor sent by an AI assistant' }
    default:
      return { value: 'First', label: 'sale', sub: on, line: 'Your first sale' }
  }
}

export default function MilestoneNotice({ m, onShare, onDismiss }: { m: Milestone; onShare: () => void; onDismiss: () => void }) {
  const w = milestoneWords(m)
  return (
    <div className="milestone" role="status">
      <span className="milestone-mark" aria-hidden="true">
        <PartyPopper size={20} strokeWidth={1.75} />
      </span>
      <span className="milestone-text">
        <b>{w.line}</b>
        <span className="faint">{w.sub}. Worth a post?</span>
      </span>
      <button type="button" className="btn primary" onClick={onShare}>
        <Share2 size={15} strokeWidth={1.75} aria-hidden="true" />
        Share it
      </button>
      <button type="button" className="btn icon ghost" aria-label="Dismiss" onClick={onDismiss}>
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  )
}
