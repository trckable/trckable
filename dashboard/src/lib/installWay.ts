// The avatar menu's "Install app": when it is shown. Chromium offers install through an
// event (lib/pwa.ts keeps it); Safari on iOS has none, only Share → Add to Home
// Screen, so there it says so instead.

export type Way = 'prompt' | 'ios' | null

type Browser = { offered: boolean; ios: boolean; installed: boolean }

/** How this browser installs the app, or null when it cannot or already has. */
export function wayToInstall({ offered, ios, installed }: Browser): Way {
  if (installed) return null
  if (offered) return 'prompt'
  return ios ? 'ios' : null
}

/** An iPhone, iPod or iPad; an iPad that asks for desktop pages says it is a Mac, but has a touch screen. */
export function isIos(ua: string, touchPoints: number): boolean {
  return /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
}
