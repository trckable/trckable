// How one moment reads in its pop: an icon, a line and a faint second line.
import { Bot, Coins, Flag, Globe, StickyNote, TrendingUp, type LucideIcon } from 'lucide-react'
import type { MilestoneKind } from '../../lib/api'
import { countryName, flag } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import { times } from '../../lib/times'
import { say } from '../milestones/words'
import { copy } from './copy'
import type { Moment, MomentKind } from './moments'

export interface Words {
  icon: LucideIcon
  line: string
  sub?: string
}

const ICONS: Record<MomentKind, LucideIcon> = { spike: TrendingUp, surge: TrendingUp, sale: Coins, country: Globe, ai: Bot, milestone: Flag, note: StickyNote }

/** fmt writes an amount in the site's currency (sales only exist with it). */
export function wordsOf(m: Moment, fmt?: (minor: number) => string): Words {
  const icon = ICONS[m.kind]
  switch (m.kind) {
    case 'spike':
      return { icon, line: m.factor ? copy.spike(times(m.factor)) : copy.newTraffic(m.visitors ?? 0), sub: m.referrer ? copy.from(m.referrer) : undefined }
    case 'surge':
      return { icon, line: copy.spike(times(m.factor ?? 0)), sub: m.text ? copy.from(m.text) : undefined }
    case 'sale': {
      const sub = [fmt && m.amount ? '+' + fmt(m.amount) : '', m.channel ? channelLabel(m.channel) : ''].filter(Boolean).join(' · ')
      return { icon, line: copy.sale(m.count ?? 1), sub: sub || undefined }
    }
    case 'country':
      return { icon, line: copy.country(countryName(m.country ?? '')), sub: flag(m.country ?? '') }
    case 'ai':
      return { icon, line: copy.ai(m.bot ?? '') }
    case 'milestone': {
      const s = say({ kind: (m.family ?? 'visitors') as MilestoneKind, value: m.value ?? 0, currency: m.currency })
      return { icon, line: copy.milestone([s.big, s.label].filter(Boolean).join(' ')) }
    }
    default:
      return { icon, line: m.text ?? copy.note }
  }
}
