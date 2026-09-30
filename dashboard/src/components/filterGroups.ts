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
  Tag,
  Target,
  type LucideIcon,
} from 'lucide-react'

export type FilterGroup = {
  name: string
  dims: { dim: string; label: string; icon: LucideIcon; note?: string }[]
}

export const FILTER_GROUPS: FilterGroup[] = [
  {
    name: 'Acquisition',
    dims: [
      { dim: 'channel', label: 'Channel', icon: Radio },
      { dim: 'referrer', label: 'Referrer', icon: Link },
      { dim: 'campaign', label: 'Campaign', icon: Megaphone },
      { dim: 'source', label: 'utm_source', icon: Tag, note: 'Full mode' },
      { dim: 'medium', label: 'utm_medium', icon: Tag, note: 'Full mode' },
    ],
  },
  {
    name: 'Content',
    dims: [
      { dim: 'entry_page', label: 'Entry page', icon: LogIn },
      { dim: 'page', label: 'Page', icon: FileText },
      { dim: 'exit_page', label: 'Exit page', icon: LogOut, note: 'Full mode' },
      { dim: 'group', label: 'Section', icon: FolderTree, note: 'None yet' },
    ],
  },
  {
    name: 'Location',
    dims: [
      { dim: 'country', label: 'Country', icon: Globe },
      { dim: 'region', label: 'Region', icon: MapIcon, note: 'Full mode' },
      { dim: 'city', label: 'City', icon: Building2, note: 'Full mode' },
    ],
  },
  {
    name: 'Device',
    dims: [
      { dim: 'device', label: 'Device', icon: MonitorSmartphone },
      { dim: 'browser', label: 'Browser', icon: AppWindow },
      { dim: 'os', label: 'OS', icon: Cpu },
      { dim: 'language', label: 'Language', icon: Languages, note: 'Full mode' },
    ],
  },
  { name: 'Behaviour', dims: [{ dim: 'goal', label: 'Goal', icon: Target, note: 'None yet' }] },
]

export const ALL_DIMS = FILTER_GROUPS.flatMap((g) => g.dims)
