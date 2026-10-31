// How one moment reads in its pop: an icon, a line and a faint second line.
import { Bot, Coins, Flag, Ghost, Globe, Newspaper, StickyNote, TrendingUp, type LucideIcon } from 'lucide-react'
import type { MilestoneKind } from '../../lib/api'
import { countryName } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import { times } from '../../lib/times'
import { say } from '../milestones/words'
import { answersCopy as answers } from '../answers/copy'
import { copy as mentions } from '../mentions/copy'
import { jumpOf } from '../mentions/model'
import { copy } from './copy'
import type { Moment, MomentKind } from './moments'

export interface Words {
  icon: LucideIcon
  line: string
  sub?: string
}

const ICONS: Record<MomentKind, LucideIcon> = { spike: TrendingUp, surge: TrendingUp, mention: Newspaper, answer: Ghost, sale: Coins, country: Globe, ai: Bot, milestone: Flag, note: StickyNote }

/** What an assistant did about a question: the first time it names the site is told on its own. */
export function answerLine(m: Pick<Moment, 'bot' | 'text' | 'what' | 'first_ever'>): string {
  const engine = answers.engine[m.bot ?? ''] ?? m.bot ?? ''
  if (m.what === 'dropped') return answers.change.dropped(engine, m.text ?? '')
  return m.first_ever ? answers.first(engine) : answers.change.seen(engine, m.text ?? '')
}

/** fmt writes an amount in the site's currency (sales only exist with it). */
export function wordsOf(m: Moment, fmt?: (minor: number) => string): Words {
  const icon = ICONS[m.kind]
  switch (m.kind) {
    case 'spike':
    case 'surge': {
      const posted = m.mention && m.factor && m.brought ? mentions.posted[m.mention === 'hn' || m.mention === 'ph' ? m.mention : 'news'] : ''
      const at = m.t.slice(11, 16)
      if (posted && m.factor && m.brought) return { icon, line: at && at !== '00:00' ? mentions.jumped(jumpOf(m.factor), at, posted, m.brought) : mentions.jumpedDay(jumpOf(m.factor), posted, m.brought), sub: m.referrer ? copy.from(m.referrer) : undefined }
      return { icon, line: m.factor ? copy.spike(times(m.factor)) : copy.newTraffic(m.visitors ?? 0), sub: m.referrer ? copy.from(m.referrer) : undefined }
    }
    case 'mention':
      return { icon, line: mentions.postedLine(mentions.postedHead[m.mention === 'hn' || m.mention === 'ph' ? m.mention : 'news'], m.brought ?? 0), sub: m.text }
    case 'answer':
      return { icon, line: answerLine(m), sub: m.first_ever ? answers.firstHint : undefined }
    case 'sale': {
      const sub = [fmt && m.amount ? '+' + fmt(m.amount) : '', m.channel ? channelLabel(m.channel) : ''].filter(Boolean).join(' · ')
      return { icon, line: copy.sale(m.count ?? 1), sub: sub || undefined }
    }
    case 'country':
      return { icon, line: copy.country(countryName(m.country ?? '')) }
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
