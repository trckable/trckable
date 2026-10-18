import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

const CHEVRON = { left: ChevronLeft, right: ChevronRight, down: ChevronDown }

export function Chevron({ dir }: { dir: 'left' | 'right' | 'down' }) {
  const Icon = CHEVRON[dir]
  return <Icon size={16} strokeWidth={1.75} color="var(--text-2)" aria-hidden="true" />
}
