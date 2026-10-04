// The filter dimensions, grouped the way somebody thinks about a visit: where
// they came from, what they read, who they are, what they did.
import {
  AppWindow,
  Building2,
  Cpu,
  FileText,
  FolderTree,
  Globe,
  Languages,
  Link,
  LogIn,
  LogOut,
  Map as MapIcon,
  Megaphone,
  MonitorSmartphone,
  Radio,
  Ruler,
  Tag,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { filterCopy as t } from './filterCopy'

export type FilterGroup = {
  name: string
  dims: { dim: string; label: string; icon: LucideIcon; note?: string }[]
}

export const FILTER_GROUPS: FilterGroup[] = [
  {
    name: t.group.acquisition,
    dims: [
      { dim: 'channel', label: t.dim.channel, icon: Radio },
      { dim: 'referrer', label: t.dim.referrer, icon: Link },
      { dim: 'campaign', label: t.dim.campaign, icon: Megaphone },
      { dim: 'source', label: t.dim.source, icon: Tag, note: t.fullMode },
      { dim: 'medium', label: t.dim.medium, icon: Tag, note: t.fullMode },
    ],
  },
  {
    name: t.group.content,
    dims: [
      { dim: 'entry_page', label: t.dim.entry_page, icon: LogIn },
      { dim: 'page', label: t.dim.page, icon: FileText },
      { dim: 'exit_page', label: t.dim.exit_page, icon: LogOut, note: t.fullMode },
      { dim: 'group', label: t.dim.group, icon: FolderTree, note: t.noneYet },
    ],
  },
  {
    name: t.group.location,
    dims: [
      { dim: 'country', label: t.dim.country, icon: Globe },
      { dim: 'region', label: t.dim.region, icon: MapIcon, note: t.fullMode },
      { dim: 'city', label: t.dim.city, icon: Building2, note: t.fullMode },
    ],
  },
  {
    name: t.group.device,
    dims: [
      { dim: 'device', label: t.dim.device, icon: MonitorSmartphone },
      { dim: 'browser', label: t.dim.browser, icon: AppWindow },
      { dim: 'browser_version', label: t.dim.browser_version, icon: AppWindow, note: t.fullMode },
      { dim: 'screen', label: t.dim.screen, icon: Ruler, note: t.fullMode },
      { dim: 'os', label: t.dim.os, icon: Cpu },
      { dim: 'language', label: t.dim.language, icon: Languages, note: t.fullMode },
    ],
  },
  { name: t.group.behaviour, dims: [{ dim: 'goal', label: t.dim.goal, icon: Target, note: t.noneYet }] },
]

export const ALL_DIMS = FILTER_GROUPS.flatMap((g) => g.dims)
