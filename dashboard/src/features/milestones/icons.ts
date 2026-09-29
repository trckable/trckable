// The icon of each milestone family, shared by the hero and the tiles.
import { Banknote, Eye, Globe, Target, Trophy, Users, type LucideIcon } from 'lucide-react'
import type { MilestoneKind } from '../../lib/api'

export const ICON: Record<MilestoneKind, LucideIcon> = { visitors: Users, pageviews: Eye, record_day: Trophy, countries: Globe, first_goal: Target, first_sale: Banknote, revenue: Banknote }
