// The avatar menu's "Install app": what it reads and what it does (when it is
// shown is installWay.ts).
import { isIos, wayToInstall, type Way } from './installWay'
import { offer, type Offer } from './pwa'

/** Running as the installed app already. */
export function isInstalled(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

/** The way to install, as it stands now, for the menu. */
export function useWayToInstall(): Way {
  const offered = offer.use() !== null
  return wayToInstall({ offered, ios: isIos(navigator.userAgent, navigator.maxTouchPoints), installed: isInstalled() })
}

/** Ask the browser to install; its own dialog takes it from there. */
export async function install(o: Offer | null = offer.get()) {
  if (!o) return
  offer.set(null) // an offer can be used once
  await o.prompt()
}
