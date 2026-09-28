// What the dialog asks the server for: a card is one address, so the preview
// and the download are the same picture.
export type Template = 'spotlight' | 'leaderboard' | 'dashboard' | 'post'
export type Period = '24h' | '7d' | '30d'
export type Metric = 'visitors' | 'pageviews' | 'revenue'
export type Theme = 'dark' | 'light'

export const TEMPLATES: Template[] = ['spotlight', 'leaderboard', 'dashboard', 'post']
export const PERIODS: Period[] = ['24h', '7d', '30d']
/** The swatches: the site's own colour first, when it has one. */
export const ACCENTS = ['#b8ff3c', '#4f8cff', '#ff5ca8', '#ffb547', '#2dd4bf']

export type Look = { template: Template; period: Period; metric: Metric; theme: Theme; accent: string }

/** The numbers in words, and the post's text. */
export type CardWords = { metric: Metric; big: string; label: string; foot: string; revenue: boolean; has_data: boolean; post: string }

export function cardUrl(site: string, l: Look, format: 'png' | 'json' = 'png'): string {
  const p = new URLSearchParams({ period: l.period, metric: l.metric })
  if (format === 'json') p.set('format', 'json')
  else {
    p.set('t', l.template)
    p.set('theme', l.theme)
    p.set('accent', l.accent)
  }
  return `/api/v1/sites/${encodeURIComponent(site)}/card?${p}`
}

export const fileName = (domain: string, l: Look) => `trckable-${domain}-${l.template}-${l.period}.png`

/** The accent on the card: a swatch, or the theme's own when none fits the light card. */
export const accentsFor = (color?: string) => (color && /^#[0-9a-f]{6}$/i.test(color) && !ACCENTS.includes(color.toLowerCase()) ? [color.toLowerCase(), ...ACCENTS] : ACCENTS)
