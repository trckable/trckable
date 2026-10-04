// What each kind of moment looks like in a cell and on the day's card: its icon
// and its own colour, from the dashboard's tokens (so both themes keep their contrast).
import { Bot, Coins, Flag, Link2, TrendingUp, Zap, type LucideIcon } from 'lucide-react'
import { fmtInt, fmtMoney } from '../../lib/format'
import { copy } from './copy'
import type { CalMoment, CalMonth, MomentKind } from './model'

const KINDS: Record<MomentKind, { Icon: LucideIcon; tint: string }> = {
  spike: { Icon: TrendingUp, tint: 'var(--accent)' },
  surge: { Icon: Zap, tint: 'var(--ch-7)' },
  sale: { Icon: Coins, tint: 'var(--money)' },
  milestone: { Icon: Flag, tint: 'var(--up)' },
  new_referrer: { Icon: Link2, tint: 'var(--ch-1)' },
  ai: { Icon: Bot, tint: 'var(--ch-5)' },
}

export const tintOf = (kind: MomentKind) => KINDS[kind].tint

export function MomentIcon({ kind, size = 12 }: { kind: MomentKind; size?: number }) {
  const { Icon, tint } = KINDS[kind]
  return <Icon size={size} strokeWidth={2} color={tint} aria-hidden="true" />
}

/** A moment in words, as the card lists it. */
export function momentText(m: CalMoment, month: Pick<CalMonth, 'currency' | 'exponent'>): string {
  const v = fmtInt(m.visitors ?? 0)
  switch (m.kind) {
    case 'spike':
      return m.factor ? copy.spike(v, `${m.factor}×`) : copy.spikeNew(v)
    case 'surge':
      return copy.surge(v, `${m.factor ?? 0}×`)
    case 'sale':
      return copy.sale(m.count ?? 1, fmtMoney(m.amount ?? 0, month.currency ?? 'USD', month.exponent ?? 2))
    case 'milestone':
      return copy.milestone(m.step ?? '')
    case 'new_referrer':
      return copy.newReferrer(m.referrer ?? '')
    case 'ai':
      return copy.ai(m.bot ?? '')
  }
}

/** The hour a moment happened in ("14:00"), or nothing for one the day keeps whole. */
export const hourOf = (m: CalMoment): string => (m.t.slice(11) && m.t.slice(11) !== '00:00' ? m.t.slice(11, 16) : '')
