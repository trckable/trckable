// How a visit opened the site, said the one way everywhere: "Desktop", "iOS browser", "iOS app", "Android app", a social app's
// own name ("Instagram"). The server groups visits the same way (device_app): a key is "Desktop", "Desktop|app", a phone's or
// tablet's system with "browser" or "app" ("iOS|app"), or a social app's key ("instagram").
import { defineCopy } from '../../i18n'

const c = defineCopy('apps', {
  desktop: 'Desktop',
  /** "iOS app", "Android app", and "Desktop app" for an app built on a web view (Tauri, Electron). */
  appOf: (system: string) => `${system} app`,
  browserOf: (system: string) => `${system} browser`,
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  snapchat: 'Snapchat',
  twitter: 'X',
  pinterest: 'Pinterest',
  line: 'LINE',
  wechat: 'WeChat',
})

/** "iPhone app", "Mac app": a device or system through the site's own app. */
export const appOf = (name: string) => c.appOf(name)

const NAMED: Record<string, string> = c as unknown as Record<string, string>
/** A social app's name, or undefined for any other key. */
export const appName = (key: string) => (Object.hasOwn(NAMED, key) && typeof NAMED[key] === 'string' ? NAMED[key] : undefined)

const PHONE = new Set(['Mobile', 'Tablet'])

/** The group a visit belongs to, as the server keys it. `app` is '', 'browser', 'app' or a social app's key. */
export function howKey(x: { device?: string; os?: string; app?: string }): string {
  const app = x.app && x.app !== 'browser' ? x.app : ''
  if (app && app !== 'app') return app
  if (PHONE.has(x.device ?? '')) return `${x.os || x.device}|${app ? 'app' : 'browser'}`
  if (x.device !== 'Desktop') return ''
  return app ? 'Desktop|app' : 'Desktop'
}

/** What a group is called: "iOS app", "Android browser", "Desktop app", "Desktop", or the social app's name. */
export function howName(key: string): string {
  const [system, kind] = key.split('|')
  if (kind === 'app') return c.appOf(system)
  if (kind === 'browser') return c.browserOf(system)
  if (system === 'Desktop') return c.desktop
  return appName(system) ?? system
}

/** Whether a group is an app of some kind: an app's web view or a social app. */
export const isAppKey = (key: string) => key.endsWith('|app') || (!key.includes('|') && key !== 'Desktop' && key !== '')
