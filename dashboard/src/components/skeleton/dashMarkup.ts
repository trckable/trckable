// The dashboard on its way, as plain HTML: the page's own shape (header, controls, a headline, four
// tiles, the chart, the answer cards, or Live's two panels) in soft blocks of the size the real parts
// have, so nothing moves when the numbers land. vite.config.ts writes it into index.html (first
// paint, before any JavaScript, no inline script or style: the CSP holds) and React draws the same
// string while the app boots, so the two are one picture. Which shape shows, the site's name and
// whether Ask is there are set on <html> by theme.js from what this browser kept (lib/bootCache.ts);
// DashSkeleton.css reads them. Pure.
import { logoInner } from '../../brand/logo'

const bars = (n: number, cls: string) => Array.from({ length: n }, () => `<i class="${cls}"></i>`).join('')

/** The header row: logo, the site (its name is set by theme.js), then Live's switch and Ask, or Data's Explore and the bell, and the avatar. */
const header = (data: boolean): string =>
  '<div class="dsk-header">' +
  `<span class="dsk-logo tkb-logo">${logoInner()}</span>` +
  '<span class="dsk-site"><i class="dsk-mark"></i><b class="dsk-name"></b></span>' +
  '<span class="dsk-grow"></span>' +
  (data ? '<i class="dsk-explore"></i><i class="dsk-bell"></i>' : '<i class="dsk-switch"></i><i class="dsk-ask"></i>') +
  '<i class="dsk-avatar"></i>' +
  '</div>'

/** Data keeps the Live | Briefing | Data switch and Ask in a row of their own under the header. */
const tools = (): string => '<div class="dsk-tools"><span class="dsk-grow"></span><i class="dsk-switch"></i><i class="dsk-ask"></i></div>'

/** The control row under it: the Story | Explore switch, then the period and the buttons. */
const controls = (): string => '<div class="dsk-controls"><i class="dsk-tabs"></i><i class="dsk-filter"></i><span class="dsk-grow"></span><i class="dsk-period"></i><i class="dsk-btn"></i><i class="dsk-btn"></i></div>'

/** Data's story: the headline, four tiles, the chart, the five answers. */
export const storyBody = (): string =>
  '<div class="dsk-story-body">' +
  '<i class="dsk-card dsk-setup"></i>' +
  '<div class="dsk-head"><i class="dsk-eyebrow"></i><i class="dsk-line"></i><i class="dsk-line short"></i><i class="dsk-take"></i></div>' +
  `<div class="dsk-tiles">${bars(4, 'dsk-card dsk-tile')}</div>` +
  '<i class="dsk-card dsk-chart"></i>' +
  `<div class="dsk-answers"><i class="dsk-title"></i><div class="dsk-cards">${bars(5, 'dsk-card dsk-answer')}</div></div>` +
  '</div>'

/** On a phone Live keeps the Live | Data switch in a row of its own; a desktop has it in the header. */
const liveTabs = (): string => '<div class="dsk-controls dsk-phone-only"><i class="dsk-tabs dsk-switch-only"></i></div>'

/** Live's two panels (the row of cards under them is made of what the site has, so it is not drawn). */
export const liveBody = (): string => '<div class="dsk-live-body"><i class="dsk-card dsk-panel"></i><i class="dsk-card dsk-feed"></i></div>'

const shell = (kind: 'story' | 'live', label: string): string =>
  `<div class="dsk dsk-is-${kind}" role="status" aria-busy="true" aria-label="${label}">${header(kind === 'story')}${kind === 'story' ? tools() + controls() + storyBody() : liveTabs() + liveBody()}</div>`

/** Both shapes; the one that shows is the <html data-boot> value. */
export const dashHtml = (label: string): string => shell('story', label) + shell('live', label)
