// The dialog behind a side card's main button: the same kind (icon, tint, name,
// when) and title as the card, then the story in detail, then the actions. One
// shell for every card, built on Modal (focus trap, Escape, focus back to the
// card's button, a bottom sheet on a phone that fills the screen). Open it from
// a lazy chunk, so none of it is in the first load.
import { X } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Modal } from '../../kit/Modal'
import type { SideKind, SideWhen } from '../SideCard/SideCard'
import { cardModal } from './copy'
import './CardModal.css'

export interface CardModalProps {
  /** The dialog's name for assistive tech. */
  label: string
  kind: SideKind
  when?: SideWhen
  /** The headline: a figure or a few words. */
  title: ReactNode
  onClose: () => void
  /** The story: bars, pages, a small chart, one line (see parts.tsx). */
  children: ReactNode
  /** Buttons, the main one last. A close is always there. */
  actions?: ReactNode
}

export function CardModal({ label, kind, when, title, onClose, children, actions }: CardModalProps) {
  return (
    <Modal label={label} onClose={onClose} className="card-modal" keepSize={false} focus="box">
      <div className="cm" style={kind.tint ? ({ '--tint': kind.tint } as CSSProperties) : undefined}>
        <button type="button" className="cm-x" aria-label={cardModal.close} onClick={onClose}>
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <header className="cm-head">
          <span className="cm-ic" aria-hidden="true">
            {kind.icon}
          </span>
          <span className="cm-kind">{kind.label}</span>
          {when && (
            <span className="cm-when faint" title={when.title}>
              {when.text}
            </span>
          )}
        </header>
        <h2 className="cm-title">{title}</h2>
        {children}
        <div className="cm-actions">
          {actions}
          {!actions && (
            <button type="button" className="btn primary" onClick={onClose}>
              {cardModal.close}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
