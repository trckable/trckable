// What the heatmap overlay and its suggestion ask the server for. Kept out of
// lib/api so the first load does not carry them.
import { call, rangeQS, type ReportQuery } from '../../lib/api'

/** The window widths a page is looked at in: phone, tablet, desktop (server/internal/query/heat.go). */
export const WIDTHS = [390, 768, 1280] as const
export type Width = (typeof WIDTHS)[number]

/** One place clicked: an element, the tenth of it that was hit, and where the element sat. x and w are thousandths of the window, y and h pixels from the top of the page. */
export interface Spot {
  el: string
  cx: number
  cy: number
  n: number
  x: number
  y: number
  w: number
  h: number
}

export interface HeatElement {
  el: string
  clicks: number
  dead: number
  rage: number
}

export interface HeatField {
  form: string
  field: string
  reached: number
  left: number
}

export interface HeatMap {
  path: string
  width: Width
  widths: { width: Width; views: number }[]
  views: number
  /** The window's average width and the page's average height, in pixels. */
  window: number
  height: number
  clicks: Spot[]
  dead: Spot[]
  rage: Spot[]
  elements: HeatElement[]
  fields: HeatField[]
  /** The share of page views that got at least 10, 20 … 100% of the way down. */
  scroll: number[]
  scroll_views: number
}

export interface HeatAsk {
  ask: boolean
  path?: string
  views?: number
}

export const heatApi = {
  map: (site: string, q: ReportQuery, path: string, width: Width | 0, signal?: AbortSignal) =>
    call<HeatMap>('GET', `/sites/${encodeURIComponent(site)}/heat` + rangeQS({ from: q.from, to: q.to }) + '&path=' + encodeURIComponent(path) + (width ? `&width=${width}` : ''), undefined, signal),
  ask: (site: string, signal?: AbortSignal) => call<HeatAsk>('GET', `/sites/${encodeURIComponent(site)}/heat/ask`, undefined, signal, true),
}
