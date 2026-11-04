// The small picture before a row of Tech: a device's icon, a browser's or a system's logo (drawn here, so nothing is fetched).
import { Globe, Monitor, Smartphone, Tablet, TabletSmartphone, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { pageIcon } from './pageIcon'
import type { Row, Tab } from './types'

const DEVICES: Record<string, LucideIcon> = { desktop: Monitor, mobile: Smartphone, tablet: Tablet }

const Logo = ({ children }: { children: ReactNode }) => (
  <svg className="xrowico mark" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    {children}
  </svg>
)

const LOGOS: [RegExp, () => ReactNode][] = [
  [
    /^edge/,
    () => (
      <Logo>
        <circle cx="12" cy="12" r="10" fill="#0c7bd0" />
        <path d="M5 13.5a7 7 0 0 0 13.5 2.2 6 6 0 0 1-9-3.2h9.3a6.8 6.8 0 0 0-6.6-6.5C8 5.9 5 8.8 5 13.5Z" fill="#35c1a0" />
      </Logo>
    ),
  ],
  [
    /^(chrome|chromium)/,
    () => (
      <Logo>
        <path d="M12 12V2a10 10 0 0 1 8.660 5Z" fill="#ea4335" />
        <path d="M12 12 20.660 7A10 10 0 0 1 12 22Z" fill="#fbbc05" />
        <path d="M12 12 12 22A10 10 0 0 1 3.340 7Z" fill="#34a853" />
        <path d="M12 12 3.340 7A10 10 0 0 1 12 2Z" fill="#ea4335" />
        <circle cx="12" cy="12" r="4.6" fill="#fff" />
        <circle cx="12" cy="12" r="3.4" fill="#4285f4" />
      </Logo>
    ),
  ],
  [
    /^safari|^mobile safari/,
    () => (
      <Logo>
        <circle cx="12" cy="12" r="10" fill="#1c9bf0" />
        <path d="m16.5 7.5-2.7 6.3L7.5 16.5l2.7-6.3Z" fill="#fff" />
        <path d="m16.5 7.5-2.7 6.3-3.6-3.6Z" fill="#ff3b30" />
      </Logo>
    ),
  ],
  [
    /^firefox/,
    () => (
      <Logo>
        <circle cx="12" cy="12" r="10" fill="#7542e5" />
        <circle cx="14" cy="10.5" r="8" fill="#ff7139" />
        <circle cx="12" cy="13" r="4.5" fill="#7542e5" />
      </Logo>
    ),
  ],
  [
    /^opera/,
    () => (
      <Logo>
        <circle cx="12" cy="12" r="10" fill="#ff1b2d" />
        <ellipse cx="12" cy="12" rx="3.2" ry="6" fill="#fff" />
      </Logo>
    ),
  ],
  [
    /^samsung/,
    () => (
      <Logo>
        <circle cx="12" cy="12" r="10" fill="#1428a0" />
        <ellipse cx="12" cy="12" rx="6.5" ry="3.2" fill="none" stroke="#fff" strokeWidth="1.8" />
      </Logo>
    ),
  ],
  [
    /instagram/,
    () => (
      <Logo>
        <rect x="2" y="2" width="20" height="20" rx="6" fill="#d6249f" />
        <rect x="2" y="2" width="20" height="20" rx="6" fill="#fd5949" opacity=".55" />
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" strokeWidth="1.8" />
        <circle cx="17" cy="7" r="1.2" fill="#fff" />
      </Logo>
    ),
  ],
  [
    /facebook|^fb/,
    () => (
      <Logo>
        <circle cx="12" cy="12" r="10" fill="#1877f2" />
        <path d="M13 20v-7h2.3l.4-2.8H13V8.5c0-.8.3-1.3 1.4-1.3H16V4.7a17 17 0 0 0-2-.2c-2.1 0-3.4 1.2-3.4 3.4v2.3H8.3V13h2.3v7Z" fill="#fff" />
      </Logo>
    ),
  ],
]

/** A logo by the name of a browser or a system, if one is drawn. */
function logoOf(name: string): ReactNode {
  const n = name.toLowerCase()
  return LOGOS.find(([re]) => re.test(n))?.[1]()
}

export const plain = (I: LucideIcon) => <I size={16} className="xrowico" aria-hidden="true" />

/** What a table's row wears before its name: a device icon, a browser's logo (a globe when none is drawn). */
export function rowMark(tab: Tab, r: Row): ReactNode {
  if (tab === 'devices') {
    const d = DEVICES[r.val.toLowerCase()]
    return d ? plain(r.val.toLowerCase() === 'tablet' ? TabletSmartphone : d) : null
  }
  if (tab === 'pages' || tab === 'entries' || tab === 'exits' || tab === 'groups') return plain(pageIcon(r.val))
  if (tab === 'browsers' || tab === 'bversion') return logoOf(r.name) ?? plain(Globe)
  return null
}
