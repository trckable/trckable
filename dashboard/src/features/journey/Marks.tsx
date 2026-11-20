// How a visitor came, drawn: the system's mark (Apple, Android, Windows, Linux), the browser's logo, or the social
// app's brand; a window icon for an app that is not named. The words stay as the title, so a mark is never the only
// thing that says it.
import { AppWindow, Compass } from 'lucide-react'
import { brandOf } from '../../lib/brandIcons'
import { logoOf } from '../../v2/explore/rowMarks'
import { appName, howKey, howName } from '../apps/copy'
import { copy } from './copy'
import type { Identity } from './model'

type Tech = Pick<Identity, 'app' | 'browser' | 'device' | 'os'>

/** How they came, in a few words: "Instagram app", "iOS app", "iOS browser", or a desktop's browser ("Safari"). `key` picks the mark: the app's key or the browser's name; `detail` is the browser behind a phone's "iOS browser". */
export function howOf(x: Pick<Tech, 'app' | 'browser' | 'device' | 'os'>): { key: string; text: string; detail?: string } {
  if (x.app && x.app !== 'browser') {
    const name = appName(x.app)
    return { key: x.app, text: name ? copy.appNamed(name) : howName(howKey(x)) }
  }
  const phone = howName(howKey(x))
  return { key: x.browser, text: x.device === 'Desktop' ? x.browser || phone : phone || x.browser, detail: x.browser }
}

/** The system's own mark, or nothing when it is not one of the four. */
const osMark = (os: string) => logoOf(os)

/** The app's brand, else the browser's logo, else a window (app) or compass (browser). */
export function howMark(key: string, app: boolean) {
  const logo = logoOf(key)
  if (logo) return logo
  const brand = app ? brandOf(`${key}.com`) : null
  if (brand)
    return (
      <svg className="xrowico mark" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d={brand.d} />
      </svg>
    )
  const G = app ? AppWindow : Compass
  return <G size={16} strokeWidth={1.9} className="xrowico" aria-hidden="true" />
}

export function OsMark({ os }: { os: string }) {
  const mark = os ? osMark(os) : null
  if (!mark) return null
  return (
    <span className="jr-mk" title={os} data-mark={os.toLowerCase()}>
      {mark}
    </span>
  )
}

export function HowMark({ x }: { x: Pick<Tech, 'app' | 'browser' | 'device' | 'os'> }) {
  const how = howOf(x)
  const app = !!x.app && x.app !== 'browser'
  return (
    <span className="jr-mk" title={how.detail && how.detail !== how.text ? `${how.text} · ${how.detail}` : how.text} data-mark={app ? 'app-' + x.app : how.key.toLowerCase()}>
      {howMark(how.key, app)}
    </span>
  )
}
