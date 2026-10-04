// The one line a closed section of the widget editor shows: what is set in it,
// so nothing has to be opened to read it.
import type { WidgetLook } from '../lib/apiMore'
import { LANGS, type Place } from './widgetKinds'
import { copy } from './widgetCopy'

export const ACCENTS = [
  { id: '', name: 'lime' },
  { id: '#38bdf8', name: 'sky' },
  { id: '#818cf8', name: 'indigo' },
  { id: '#f472b6', name: 'pink' },
  { id: '#fb923c', name: 'orange' },
  { id: '#facc15', name: 'yellow' },
]
export const RADII = [
  { id: 4, label: 'Square' },
  { id: 16, label: 'Rounded' },
  { id: 28, label: 'Round' },
]
export const THEME_NAME = { auto: 'Auto', dark: 'Dark', light: 'Light' }
export const PLACE_SHORT: Record<Place, string> = { inline: 'Inline', br: 'Corner ↘', bl: 'Corner ↙' }
const SEP = ' · '

export const SECTION = copy.section

const radiusName = (r: number) => RADII.find((x) => x.id === r)?.label ?? `${r} px`
const accentName = (a: string) => ACCENTS.find((x) => x.id === a)?.name ?? a

export const lookSummary = (l: WidgetLook) => [SECTION.look, THEME_NAME[l.theme] ?? l.theme, accentName(l.accent), radiusName(l.radius)].join(SEP)

export const placeSummary = (p: Place) => [SECTION.placement, PLACE_SHORT[p]].join(SEP)

export function languageSummary(l: WidgetLook) {
  const words = Object.values(l.texts).filter((t) => t.trim()).length
  const lang = l.lang === 'auto' ? 'Auto' : (LANGS.find((x) => x.id === l.lang)?.label ?? l.lang)
  return [SECTION.language, lang, words === 0 ? 'default texts' : `${words} ${words === 1 ? 'text' : 'texts'} changed`].join(SEP)
}

export const brandSummary = (l: WidgetLook) => [SECTION.brand, l.brand ? 'shown' : 'hidden'].join(SEP)
