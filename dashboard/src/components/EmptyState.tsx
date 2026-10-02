// An empty list, said kindly: the ghost, one short line and one action. For
// the places a person has to start something (goals, funnels, revenue, notes,
// alerts), never for a list that is only waiting for traffic.
import type { ReactNode } from 'react'
import { Ghost } from './Logo'
import './EmptyState.css'

export function EmptyState({ line, action, onAction, icon }: { line: string; action?: string; onAction?: () => void; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon ?? <Ghost size={44} />}
      <p>{line}</p>
      {action && onAction && (
        <button type="button" className="btn ghost" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  )
}
