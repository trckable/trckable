// The small icon a table's tab wears in its section's strip. A section opts in by naming its tabs here.
import { BadgeDollarSign, CreditCard, FileText, Folders, Globe, Layers, LogIn, LogOut, Monitor, Route, Smartphone, Users, Wifi, type LucideIcon } from 'lucide-react'
import type { Tab } from './types'

export const TAB_ICONS: Partial<Record<Tab, LucideIcon>> = {
  devices: Smartphone,
  browsers: Globe,
  networks: Wifi,
  bversion: Layers,
  screens: Monitor,
  pages: FileText,
  paths: Route,
  entries: LogIn,
  exits: LogOut,
  groups: Folders,
  sells: BadgeDollarSign,
  sales: BadgeDollarSign,
  payments: CreditCard,
  customers: Users,
}
