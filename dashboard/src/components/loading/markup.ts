// The loading ghost as plain HTML, for React and for the boot page alike:
// vite.config.ts writes it into index.html so the first paint, before any
// JavaScript, is already the ghost (no inline script or style: the CSP holds).
import { nameHtml, stageSvg } from './stage'

export type LoadingSize = 'inline' | 'block' | 'page'

/** The stage's pixel width for each loader size. */
export const PX: Record<LoadingSize, number> = {
  inline: 16,
  block: 88,
  page: 150,
}

/** The animated mark: a soft accent glow behind the stage, and on a page the name. */
export const markHtml = (size: LoadingSize): string =>
  '<span class="ld-glow"></span>' + stageSvg(size, PX[size]) + nameHtml(size)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The whole page-size loader, for index.html's #root. */
export const bootHtml = (label: string): string =>
  `<div class="ld ld-page" role="status" aria-busy="true" aria-label="${esc(label)}">` +
  `<span class="ld-mark" aria-hidden="true">${markHtml('page')}</span></div>`
