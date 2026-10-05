// The dialog behind the notices card: the sale that made it ask, what a notice would be about, and
// the button that asks the browser (only from here, never by itself).
import { Bell } from 'lucide-react'
import { CardModal } from '../../components/CardModal/CardModal'
import { cardModal } from '../../components/CardModal/copy'
import { Meaning, Part } from '../../components/CardModal/parts'
import type { Sale } from '../../lib/api'
import { fmtMoney } from '../../lib/format'
import { signals } from './copy'

const t = signals.card

export default function NotifyModal({ sale, onClose, onYes }: { sale?: Sale; onClose: () => void; onYes: () => void }) {
  return (
    <CardModal
      label={t.label}
      kind={{ icon: <Bell size={14} strokeWidth={2} />, label: t.label, tint: 'var(--accent)' }}
      title={t.title}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {cardModal.close}
          </button>
          <button type="button" className="btn primary" onClick={onYes}>
            {t.yes}
          </button>
        </>
      }
    >
      {sale && (
        <Part title={t.latest}>
          <b className="num">{fmtMoney(sale.amount, sale.currency, sale.exponent)}</b>
        </Part>
      )}
      <Meaning>{t.body}</Meaning>
    </CardModal>
  )
}
