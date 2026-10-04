// What each kind of pin is on a card: its icon, its name and its own colour,
// all from the dashboard's tokens (so both themes keep their contrast).
import { Bot, Coins, Flag, Link2, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import type { SideKind } from '../../components/SideCard/SideCard'
import { titleOf } from './copy'
import type { Chip } from './SourceChip'
import type { Pin, PinKind } from './pins'

const KINDS: Record<PinKind, { Icon: LucideIcon; tint: string }> = {
  spike: { Icon: TrendingUp, tint: 'var(--accent)' },
  surge: { Icon: TrendingUp, tint: 'var(--accent)' },
  sale: { Icon: Coins, tint: 'var(--money)' },
  referrer: { Icon: Link2, tint: 'var(--ch-1)' },
  drop: { Icon: TrendingDown, tint: 'var(--down)' },
  milestone: { Icon: Flag, tint: 'var(--accent)' },
  ai: { Icon: Bot, tint: 'var(--ch-5)' },
  move: { Icon: TrendingUp, tint: 'var(--ch-7)' },
  pays: { Icon: Coins, tint: 'var(--money)' },
}

/** The icon a kind wears: on the card and on its marker alike. */
export const iconOf = (kind: PinKind): LucideIcon => KINDS[kind].Icon

export function kindOf(pin: Pin): SideKind {
  const { Icon, tint } = KINDS[pin.kind]
  return { icon: <Icon size={14} strokeWidth={2} />, label: titleOf(pin), tint }
}

/** The ghost sits in the corner of a milestone and of a first sale only. */
export const hasGhost = (pin: Pin) => pin.kind === 'milestone'

/** Where the figure came from, as chips. */
export function chipsOf(pin: Pin): Chip[] {
  const { n } = pin
  const f = pin.filters[0]
  switch (pin.kind) {
    case 'spike':
    case 'surge':
      return n.referrer ? [{ host: n.referrer }] : []
    case 'sale':
      return n.channel ? [{ channel: n.channel }] : []
    case 'referrer':
      return n.name ? [{ host: n.name }] : []
    case 'drop':
      return n.name ? [{ path: n.name }] : []
    case 'ai':
      return [{ channel: 'AI' }]
    case 'move':
    case 'pays':
      if (!n.name) return []
      return f?.dim === 'channel' ? [{ channel: n.name }] : [{ host: n.name }]
    case 'milestone':
      return []
  }
}
