// The small icon a table's tab wears in its section's strip. A section opts in by naming its tabs here.
import { Globe, Layers, Monitor, Smartphone, Wifi, type LucideIcon } from 'lucide-react'
import type { Tab } from './types'

export const TAB_ICONS: Partial<Record<Tab, LucideIcon>> = {
  devices: Smartphone,
  browsers: Globe,
  networks: Wifi,
  bversion: Layers,
  screens: Monitor,
}
