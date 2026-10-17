// The dashboard on its way, as plain HTML: the page's own shape (header, the hero card, four
// tiles, the cards, or Live's two panels) in soft blocks of the size the real parts
// have, so nothing moves when the numbers land. vite.config.ts writes it into index.html (first
// paint, before any JavaScript, no inline script or style: the CSP holds) and React draws the same
// string while the app boots, so the two are one picture. Which shape shows, the site's name and
// whether Ask is there are set on <html> by theme.js from what this browser kept (lib/bootCache.ts);
// DashSkeleton.css reads them. Pure.
import { logoInner } from '../../brand/logo'

const bars = (n: number, cls: string) => Array.from({ length: n }, () => `<i class="${cls}"></i>`).join('')

/** The header row: logo, the site (its name is set by theme.js), then Live's switch and Ask, or the Briefing's Explore and the bell, and the avatar. */
const header = (data: boolean): string =>
  '<div class="dsk-header">' +
  `<span class="dsk-logo tkb-logo">${logoInner()}</span>` +
  '<span class="dsk-site"><i class="dsk-mark"></i><b class="dsk-name"></b></span>' +
  '<span class="dsk-grow"></span>' +
  (data ? '<i class="dsk-explore"></i><i class="dsk-bell"></i>' : '<i class="dsk-switch"></i><i class="dsk-ask"></i>') +
  '<i class="dsk-avatar"></i>' +
  '</div>'

/** The Briefing: the hero card, the four tiles and the first cards. */
export const storyBody = (): string =>
  '<div class="dsk-story-body">' +
  '<i class="dsk-card dsk-hero"></i>' +
  `<div class="dsk-kcs">${bars(4, 'dsk-card dsk-kc')}</div>` +
  `<div class="dsk-cards">${bars(4, 'dsk-card dsk-answer')}</div>` +
  '</div>'

/** Live's two panels (the row of cards under them is made of what the site has, so it is not drawn). */
const liveBody = (): string => '<div class="dsk-live-body"><i class="dsk-card dsk-panel"></i><i class="dsk-card dsk-feed"></i></div>'

const shell = (kind: 'story' | 'live', label: string): string =>
  `<div class="dsk dsk-is-${kind}" role="status" aria-busy="true" aria-label="${label}">${header(kind === 'story')}${kind === 'story' ? storyBody() : liveBody()}</div>`

/** Both shapes; the one that shows is the <html data-boot> value. */
export const dashHtml = (label: string): string => shell('story', label) + shell('live', label)
