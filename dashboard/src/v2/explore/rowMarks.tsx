// The small picture before a row of Tech and Sources: a device's icon, a browser's, a system's or a site's mark (drawn here, so nothing is fetched).
import { Globe, Monitor, Smartphone, Tablet, TabletSmartphone, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { brandOf } from '../../lib/brandIcons'
import { pageIcon } from './pageIcon'
import type { Row, Tab } from './types'

export const plain = (I: LucideIcon) => <I size={16} className="xrowico" aria-hidden="true" />

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
  [
    /^(ios|ipados|macos|mac os|os x)/,
    // Simple Icons "apple" (CC0), in the text colour as Apple's own mark is.
    () => (
      <Logo>
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" fill="currentColor" />
      </Logo>
    ),
  ],
  [
    /^android/,
    () => (
      // Simple Icons "android" (CC0), in Android's green.
      <Logo>
        <path d="M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z" fill="#34a853" />
      </Logo>
    ),
  ],
  [
    /^windows/,
    () => (
      <Logo>
        <path d="M3 5.400 10.500 4.400v7H3Zm8.500-1.100L21 3v8.400h-9.500ZM3 12.600h7.500v7L3 18.600Zm8.500 0H21V21l-9.500-1.300Z" fill="#0a8bd6" />
      </Logo>
    ),
  ],
  [
    /^(linux|ubuntu|debian|fedora)/,
    () => (
      <Logo>
        <ellipse cx="12" cy="14" rx="6" ry="8" fill="currentColor" />
        <circle cx="12" cy="6.500" r="3.400" fill="currentColor" />
        <ellipse cx="12" cy="15.500" rx="3.200" ry="5" style={{ fill: 'var(--surface-2)' }} />
        <path d="M9 7.200h6l-3 1.700Z" fill="#f5a623" />
      </Logo>
    ),
  ],
]

/** A referring site by its mark from lib/brandIcons (the one the Quality table draws), a globe when none is known. */
function siteMark(host: string): ReactNode {
  const brand = brandOf(host)
  if (!brand) return plain(Globe)
  return (
    <svg className="xrowico mark" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" role="img" aria-label={brand.name}>
      <path d={brand.d} />
    </svg>
  )
}

/** A logo by the name of a browser or a system, if one is drawn. */
export function logoOf(name: string): ReactNode {
  const n = name.toLowerCase()
  return LOGOS.find(([re]) => re.test(n))?.[1]()
}


/** What a table's row wears before its name: a device icon, a browser's logo (a globe when none is drawn), a channel's icon, a referring site's mark. */
export function rowMark(tab: Tab, r: Row): ReactNode {
  if (tab === 'devices') {
    const d = DEVICES[r.val.toLowerCase()]
    return d ? plain(r.val.toLowerCase() === 'tablet' ? TabletSmartphone : d) : null
  }
  if (tab === 'pages' || tab === 'entries' || tab === 'exits' || tab === 'groups') return plain(pageIcon(r.val))
  if (tab === 'browsers' || tab === 'bversion') return logoOf(r.name) ?? plain(Globe)
  if (tab === 'sources') return siteMark(r.val)
  return null
}
