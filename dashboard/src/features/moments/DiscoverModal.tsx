// The dialog behind a guide card for what is not yet used (your own visits, Replay, Full, the weekly
// email, Search Console): the period's visitors as a small line with their total, one line on what
// the thing is, and the action the card used to take.
import type { LucideIcon } from 'lucide-react'
import { CardModal } from '../../components/CardModal/CardModal'
import { cardModal } from '../../components/CardModal/copy'
import { periodOf } from '../../components/CardModal/period'
import { Meaning, Part, Spark } from '../../components/CardModal/parts'
import type { Point } from '../../lib/api'
import { copy } from './copy'
import type { CardId } from './firstWeek'

export interface DiscoverModalProps {
  id: Exclude<CardId, 'ai'>
  Icon: LucideIcon
  tint: string
  text: { label: string; title: string; go: string }
  tz: string
  series: readonly Point[]
  busy?: boolean
  onClose: () => void
  onGo: () => void
}

export default function DiscoverModal({ id, Icon, tint, text, tz, series, busy, onClose, onGo }: DiscoverModalProps) {
  const period = periodOf(tz)
  const values = series.map((p) => p.visitors)
  const total = values.reduce((a, b) => a + b, 0)
  return (
    <CardModal
      label={text.label}
      kind={{ icon: <Icon size={14} strokeWidth={2} />, label: text.label, tint }}
      when={values.length > 1 ? { text: period.text, title: cardModal.inPeriod } : undefined}
      title={text.title}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {cardModal.close}
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={onGo}>
            {text.go}
          </button>
        </>
      }
    >
      {values.length > 1 && (
        <Part title={cardModal.visitors(total)}>
          <Spark values={values} label={cardModal.visitorsLabel} />
        </Part>
      )}
      <Meaning>{copy.modal[id]}</Meaning>
    </CardModal>
  )
}
