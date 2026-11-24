// The look of a site's cards, kept by this browser for the site: the background, the colour and the three switches.
// localStorage only, every read guarded: a browser that will not say gives the defaults.
import { read, write } from '../moments/store'
import { ACCENTS, DEFAULT_STYLE, STYLES, type Style } from './card'

const key = (site: string) => `trckable:share-style:${site}`

/** What was kept for the site, with anything that is not a style of this build put back to the default. */
export function savedStyle(site: string): Style {
  const s = read<Partial<Style>>(key(site), {})
  const style = STYLES.find((x) => x.id === s.style)
  const accent = ACCENTS.find((c) => c === s.accent)
  return {
    style: style?.id ?? DEFAULT_STYLE.style,
    accent: accent ?? DEFAULT_STYLE.accent,
    name: s.name ?? DEFAULT_STYLE.name,
    date: s.date ?? DEFAULT_STYLE.date,
    chart: s.chart ?? DEFAULT_STYLE.chart,
  }
}

export const keepStyle = (site: string, s: Style) => write(key(site), s)
