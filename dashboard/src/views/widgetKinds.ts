// The designs of Settings → Widgets: what each one is called, the parts it can
// show, the size of its frame, and the code that puts it on a page. The server
// has the same sizes for the online design's corner script (api/widgetonline.go).
import { Activity, BadgeCheck, Banknote, CircleDot, ShieldCheck, Users } from 'lucide-react'
import type { Widget, WidgetKind, WidgetLook } from '../lib/apiMore'

export type Place = 'inline' | 'br' | 'bl'

export const KINDS: { id: WidgetKind; name: string; hint: string; Icon: typeof Activity; w: number; fresh?: boolean }[] = [
  { id: 'live', name: 'Live now', hint: 'Visitors in the last 30 minutes, minute by minute', Icon: Activity, w: 320 },
  { id: 'online', name: 'Online', hint: 'How many are on the site now: a pill, a pill with a graph, or a card', Icon: Users, w: 280 },
  { id: 'badge', name: 'Last 7 days', hint: 'Visitors in the last seven days', Icon: BadgeCheck, w: 260 },
  { id: 'counter', name: 'Counter', hint: 'Visitors in the last 30 minutes, in one line', Icon: CircleDot, w: 200 },
  { id: 'revenue', name: 'Open revenue', hint: "This month's revenue and the channels that brought it", Icon: Banknote, w: 320, fresh: true },
  { id: 'privacy', name: 'Privacy seal', hint: 'What this site records, read live from its settings', Icon: ShieldCheck, w: 320, fresh: true },
]
// Every WidgetKind has its entry above; the fallback only satisfies the types.
export const kindOf = (id: WidgetKind) => KINDS.find((x) => x.id === id) ?? KINDS[0]

// The parts a design can show, with the ones it starts with.
export const PARTS: Record<WidgetKind, { id: string; name: string; hint?: string }[]> = {
  live: [
    { id: 'bars', name: 'Minute by minute', hint: 'Thirty bars, with the time and count on hover' },
    { id: 'countries', name: 'Where from', hint: 'The top three countries' },
    { id: 'channels', name: 'Came from', hint: 'Search, AI assistants, social…' },
    { id: 'pages', name: 'Reading now', hint: 'The top three pages. Their paths become public' },
  ],
  // The lists of the online card. Each shows only when three or more are on it.
  online: [
    { id: 'pages', name: 'Reading now', hint: 'Pages with three or more people on them. Their paths become public' },
    { id: 'countries', name: 'Where from', hint: 'Countries with three or more people' },
  ],
  badge: [{ id: 'ai', name: 'Share from AI assistants', hint: 'Visitors who came from ChatGPT, Claude, Perplexity…' }],
  counter: [],
  revenue: [{ id: 'channels', name: 'Where it came from', hint: 'The channels that brought the money' }],
  privacy: [],
}
export const DEFAULT_PARTS: Record<WidgetKind, string[]> = { live: ['bars', 'countries'], online: ['spark'], badge: [], counter: [], revenue: ['channels'], privacy: [] }

// The online design's three modes, each a set of parts.
export const MODES = [
  { id: 'pill', label: 'Pill', shows: [] as string[] },
  { id: 'spark', label: 'Pill + graph', shows: ['spark'] },
  { id: 'card', label: 'Card', shows: ['card', 'pages'] },
]
export const modeOf = (shows: string[]) => MODES.find((m) => shows.includes(m.id))?.id ?? 'pill'

// What the part list shows for a look: the online design has lists only in its card.
export const partsOf = (look: WidgetLook) => (look.kind === 'online' && modeOf(look.shows) !== 'card' ? [] : PARTS[look.kind])

// The look a widget is drawn from, as the preview page takes it.
export const previewUrl = (site: string, l: WidgetLook) => {
  const q = new URLSearchParams({ kind: l.kind, theme: l.theme, accent: l.accent, radius: String(l.radius), shows: l.shows.join(','), lang: l.lang })
  for (const [k, v] of Object.entries(l.texts)) if (v) q.set('text.' + k, v)
  return `/api/v1/sites/${encodeURIComponent(site)}/widgets/preview?${q.toString()}`
}

// The languages a widget speaks (the server's message files), by their own names.
export const LANGS = [
  { id: 'auto', label: "Auto: the visitor's language" },
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
  { id: 'fr', label: 'Français' },
  { id: 'es', label: 'Español' },
  { id: 'it', label: 'Italiano' },
  { id: 'nl', label: 'Nederlands' },
  { id: 'pt', label: 'Português' },
  { id: 'sq', label: 'Shqip' },
]

// The labels an owner can reword, per design: the key the server stores, the
// message it replaces (api/widgetlang/en.json) and its English default, shown as
// the placeholder. {n}, {pct}, {month}, {domain} and {time} are filled in.
export interface TextField {
  key: string
  msg: string
  label: string
  def: string
}
export const TEXT_FIELDS: Record<WidgetKind, TextField[]> = {
  online: [
    { key: 'online', msg: 'online', label: 'After the count', def: 'online' },
    { key: 'few', msg: 'few', label: 'Under three', def: 'A few' },
    { key: 'title', msg: 'online_title', label: 'Card title', def: 'Online now' },
    { key: 'pages', msg: 'reading', label: 'Pages', def: 'Reading now' },
    { key: 'countries', msg: 'from', label: 'Countries', def: 'Where from' },
  ],
  live: [
    { key: 'title', msg: 'live_title', label: 'Title', def: 'Visitors in the last 30 minutes' },
    { key: 'countries', msg: 'from', label: 'Countries', def: 'Where from' },
    { key: 'channels', msg: 'came', label: 'Channels', def: 'Came from' },
    { key: 'pages', msg: 'reading', label: 'Pages', def: 'Reading now' },
  ],
  badge: [
    { key: 'week', msg: 'week', label: 'Caption', def: 'visitors in the last 7 days' },
    { key: 'ai', msg: 'ai', label: 'AI share', def: '{pct} from AI assistants' },
  ],
  counter: [{ key: 'now', msg: 'counter', label: 'Line', def: '{n} in the last 30 min' }],
  revenue: [
    { key: 'title', msg: 'rev_title', label: 'Title', def: 'Revenue in {month}' },
    { key: 'channels', msg: 'rev_channels', label: 'Channels', def: 'Where it came from' },
  ],
  privacy: [
    { key: 'title', msg: 'seal_title', label: 'Title', def: 'How {domain} measures visits' },
    { key: 'foot', msg: 'seal_foot', label: 'Footer', def: "Read live from this site's settings at {time}" },
  ],
}
export const MAX_TEXT = 40
export const EMPTY_LOOK: WidgetLook = { kind: 'live', theme: 'auto', accent: '', radius: 16, brand: true, lang: 'auto', texts: {}, shows: DEFAULT_PARTS.live }

export const MAX_NAME = 40

// What an unnamed widget is called (the server's own table has the same names).
const MODE_NAME: Record<string, string> = { pill: 'Online pill', spark: 'Online pill + graph', card: 'Online card' }
export const defaultName = (look: WidgetLook) => (look.kind === 'online' ? MODE_NAME[modeOf(look.shows)] : kindOf(look.kind).name)

export const STAGE = { title: 'Widget preview', tone: 'Page tone', view: 'View', light: 'Light', dark: 'Dark', alone: 'Alone', page: 'On a page' }

export const TEXT = {
  mode: 'Mode',
  show: 'Show',
  theme: 'Theme',
  colour: 'Colour',
  corners: 'Corners',
  placement: 'Placement',
  nameLabel: 'Name',
  only: ' · only in trckable',
  made: '· made',
  edit: 'Edit',
  rename: 'Rename',
  delete: 'Delete',
  menu: 'Widget menu',
  name: 'Widget name',
  editTitle: 'Edit widget',
  editHint: 'The code on your pages stays the same',
  make: ['Make this widget', 'Making it…'],
  save: 'Save changes',
  saving: 'Saving…',
  cancel: 'Cancel',
  saved: 'Widget saved. Pages that show it follow within a minute',
  language: 'Language',
  texts: 'Texts',
  textsHint: 'Leave empty for the translated default',
  frame: 'Paste this where the card should appear',
  corner: 'Or paste this once, to float it in a corner of every page. Visitors can close it',
  copyFrame: 'Copy embed code',
  copyCorner: 'Copy the corner script',
  snippet: 'Snippet copied',
  script: 'Script copied',
}

// The page's height for a look, so the frame never scrolls or leaves a gap.
const LIST = 104 // a heading and three rows
export const size = (look: WidgetLook) => {
  const has = (p: string) => look.shows.includes(p)
  const brand = look.brand ? 34 : 0
  if (look.kind === 'online') {
    // The pills carry their brand as a mark inside; the card has a line under it.
    if (!has('card')) return { w: has('spark') ? 230 : 180, h: 44 }
    return { w: 280, h: 214 + brand + LIST * ['pages', 'countries'].filter(has).length }
  }
  let h = 0
  if (look.kind === 'live') h = 106 + (has('bars') ? 100 : 0) + LIST * ['countries', 'channels', 'pages'].filter(has).length
  else if (look.kind === 'revenue') h = 106 + (has('channels') ? LIST : 0)
  else if (look.kind === 'privacy') h = 250
  else if (look.kind === 'badge') h = 72
  else h = 44
  return { w: kindOf(look.kind).w, h: h + brand }
}

export function frameCode(base: string, w: Widget, domain: string) {
  const { w: width, h } = size(w)
  return `<iframe src="${base}/w/${w.id}" width="${width}" height="${h}" style="border:0;background:transparent" loading="lazy" title="${kindOf(w.kind).name} on ${domain}"></iframe>`
}

// The online design's corner placement: one script tag, no markup of its own.
export function cornerCode(base: string, w: Widget, place: Place = 'br') {
  return `<script async src="${base}/js/${w.id}.online.js"${place === 'bl' ? ' data-pos="bl"' : ''}></script>`
}

export function snippet(base: string, w: Widget, domain: string, place: Place = 'inline') {
  if (place === 'inline') return frameCode(base, w, domain)
  if (w.kind === 'online') return cornerCode(base, w, place)
  // Floating: a fixed corner, still no script.
  const side = place === 'br' ? 'right' : 'left'
  return `<div style="position:fixed;${side}:16px;bottom:16px;z-index:50;max-width:calc(100vw - 32px)">\n  ${frameCode(base, w, domain)}\n</div>`
}
