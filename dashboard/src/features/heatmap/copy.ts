// Every word of the heatmap overlay and its card.
import { defineCopy } from '../../i18n'
import { fmtInt } from '../../lib/format'

export const heatCopy = defineCopy('heatmap', {
  open: (path: string) => `Heatmap of ${path}`,
  close: 'Close',
  width: { 390: 'Phone', 768: 'Tablet', 1280: 'Desktop' } as Record<number, string>,
  widthTip: (name: string, views: number) => `${name}: ${fmtInt(views)} ${views === 1 ? 'view' : 'views'}`,
  layers: { clicks: 'Clicks', scroll: 'How far down', trouble: 'Dead and rage clicks', page: 'The page' },
  views: (n: number) => `${fmtInt(n)} ${n === 1 ? 'view' : 'views'}`,
  none: 'Nothing counted for this page yet.',
  noneWidth: 'Nothing counted at this width.',
  loading: 'Loading',
  elements: 'Most clicked',
  forms: 'Forms',
  dead: 'Dead',
  rage: 'Rage',
  reached: 'Reached',
  left: 'Left here',
  deadTip: 'Looks clickable, and nothing happened',
  rageTip: 'Three clicks within a second',
  scrollTip: (pct: number, share: number) => `${Math.round(share * 100)}% scrolled past ${pct}%`,
  demo: 'Example data',
  frame: 'This page, as a plain document: nothing on it runs here.',
  // The card that suggests the module.
  card: {
    label: 'Heatmaps',
    title: (path: string, views: number) => `${path} had ${fmtInt(views)} views today`,
    body: 'See where people click on it. Nobody is recorded.',
    go: 'Turn on',
    preview: 'Preview',
    close: 'Close',
    on: 'Heatmaps are on',
  },
} as const)
