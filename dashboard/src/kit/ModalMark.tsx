// The icon tile beside a dialog's title (Modal's `frame.icon`).
import type { LucideIcon } from 'lucide-react'

export function ModalMark({ icon: Icon, danger }: { icon?: LucideIcon; danger?: boolean }) {
  if (!Icon) return null
  return (
    <span className={'modal-badge' + (danger ? ' danger' : '')} aria-hidden="true">
      <Icon size={19} strokeWidth={1.75} />
    </span>
  )
}
