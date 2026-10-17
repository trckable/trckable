// Settings → Alerts: each alert, as the sentence it is. The threshold sits inside the sentence.
import { Banknote, Bell, CalendarDays, HardDrive, Newspaper, TrendingUp, Trophy, WifiOff, Zap } from 'lucide-react'
import type { Alert, Site } from '../lib/apiMore'
import { copy as mentions } from '../features/mentions/copy'
import { hasMentions } from '../lib/me'

const DAYS = ['Sunday', 'Monday']

export const KINDS: { id: Alert['kind']; label: string; Icon: typeof Bell; before?: string; unit?: string; fallback: number; hint: (site: Site) => string }[] = [
  { id: 'stopped', label: 'Tracking stopped', Icon: WifiOff, before: 'No visits for', unit: 'hours', fallback: 6, hint: () => 'when it normally has some by then' },
  { id: 'spike', label: 'Busy day', Icon: TrendingUp, before: 'Today reaches', unit: '× a normal day', fallback: 3, hint: () => 'and at least 50 visitors' },
  { id: 'surge', label: 'Traffic surge', Icon: Zap, fallback: 0, hint: () => 'Busier than usual right now (at least one and a half times, and 10 more people): who sent them, at most once every three hours' },
  { id: 'customer', label: 'Money in', Icon: Banknote, fallback: 0, hint: () => 'A new customer, an upgrade or a refund, as it happens' },
  { id: 'disk', label: 'Disk filling up', Icon: HardDrive, before: 'Less than', unit: 'days of room left', fallback: 14, hint: () => 'at the rate the last week wrote' },
  { id: 'weekly', label: 'Weekly report', Icon: CalendarDays, fallback: 0, hint: (site) => `${DAYS[site.week_start === 0 ? 0 : 1]} from 8:00: last week's visitors, sources, pages, goals and revenue, then what changed` },
  { id: 'milestone', label: 'Milestone reached', Icon: Trophy, fallback: 0, hint: () => 'A round number, the day after it is reached; money without the amount' },
  { id: 'mention', label: mentions.alert.label, Icon: Newspaper, fallback: 0, hint: () => mentions.alert.hint },
]

/** The alerts on offer: Mentions' one only while Mentions is switched on. */
export const shownKinds = () => KINDS.filter((k) => k.id !== 'mention' || hasMentions())
