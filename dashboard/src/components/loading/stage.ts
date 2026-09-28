// The loader's motion stage: the logo's own ghost, plus the chart it watches
// (a line that draws itself, bars that rise out of it, data dots drifting up
// into the ghost). Each size gets only the parts its choreography uses;
// Loading.css moves them.
import { EYES, GHOST, NAME } from '../../brand/logo'
import type { LoadingSize } from './markup'

type Part = 'trace' | 'chart' | 'dots' | 'name'

/** Which parts each size plays: the full story, a compact loop, the ghost alone. */
const PARTS: Record<LoadingSize, Part[]> = {
  page: ['trace', 'chart', 'dots', 'name'],
  block: ['chart'],
  inline: [],
}

/** The bars' heights, left to right, rising towards the right like the line. */
const BARS = [12, 17, 10, 21, 26]
const LINE = 'M10 76l15-8 13 5 15-10 13 3 16-12'

const ghost = (trace: boolean): string =>
  (trace ? `<path class="ld-trace" d="${GHOST}" pathLength="1"/>` : '') +
  `<g class="ld-boo"><path class="ld-body" d="${GHOST}" fill="#b8ff3c"/><g class="ld-eyes">${EYES}</g></g>`

const bars = (): string =>
  '<g class="ld-bars">' +
  BARS.map((h, i) => `<rect x="${13 + i * 15}" y="${80 - h}" width="9" height="${h}" rx="2"/>`).join('') +
  '</g>' +
  `<path class="ld-line" d="${LINE}" pathLength="1"/>`

const dots = (): string =>
  '<g class="ld-dots"><circle cx="40" cy="62" r="1.8"/><circle cx="50" cy="60" r="2.1"/><circle cx="58" cy="63" r="1.5"/></g>'

/** The stage's SVG, `width` pixels wide. */
export function stageSvg(size: LoadingSize, width: number): string {
  const parts = PARTS[size]
  if (!parts.includes('chart')) {
    return `<svg class="ld-stage" width="${width}" height="${width}" viewBox="0 0 64 64" aria-hidden="true">${ghost(false)}</svg>`
  }
  const height = Math.round((width * 84) / 96)
  return (
    `<svg class="ld-stage" width="${width}" height="${height}" viewBox="0 0 96 84" aria-hidden="true">` +
    `<g transform="translate(16 0)">${ghost(parts.includes('trace'))}</g>` +
    (parts.includes('dots') ? dots() : '') +
    bars() +
    '</svg>'
  )
}

/** The name under the page-size stage, fading in once the ghost is drawn. */
export const nameHtml = (size: LoadingSize): string => (PARTS[size].includes('name') ? `<span class="ld-name">${NAME}</span>` : '')
