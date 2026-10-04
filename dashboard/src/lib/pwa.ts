// The dashboard as an installed app: the worker that keeps its shell for an
// offline start (public/sw.js), and the browser's offer to install, kept until
// the avatar menu asks for it (components/AccountItems.tsx). This is all the
// first load carries; what the menu does with the offer is its own chunk (lib/installApp.ts).
import { whenIdle } from './lazyLoad'
import { miniStore } from './miniStore'

/** What the browser offers: install this app. Chromium fires it once, early. */
export type Offer = Event & { prompt: () => Promise<unknown> }

export const offer = miniStore<Offer | null>(null)

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // the browser's own bar stays away; the menu item asks instead
  offer.set(e as Offer)
})
addEventListener('appinstalled', () => offer.set(null))

// A shared page is not the app: no worker for someone only reading it.
if ('serviceWorker' in navigator && !/^\/s(\/|$)/.test(location.pathname)) {
  whenIdle(() => void navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
