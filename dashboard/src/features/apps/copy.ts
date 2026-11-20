// What a visit from a phone or tablet says about how it opened the site: in the phone's browser, in an app's web view, or in a social app.
import { defineCopy } from '../../i18n'

const c = defineCopy('apps', {
  browser: 'Browser',
  inApp: 'In an app',
  /** The small tag on a visit in Live, for an app that is not a named one. */
  tag: 'App',
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

const NAMED: Record<string, string> = c
export const appName = (key: string) => (Object.hasOwn(NAMED, key) ? NAMED[key] : undefined)

/** The social app's name, or the app tag for any other app's web view. */
export const appTag = (key: string): string => (key === 'app' ? c.tag : appName(key) ?? c.tag)

/** A line under Mobile or Tablet in the device table: the browser, an app's web view, or the social app. */
export function appLine(key: string): string {
  if (key === 'browser') return c.browser
  if (key === 'app') return c.inApp
  return appName(key) ?? c.inApp
}
