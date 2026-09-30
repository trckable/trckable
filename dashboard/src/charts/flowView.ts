// What the page-flow chart decides before it draws: how tall each node is
// allowed to be, which colour each page keeps, and which names fit. No React,
// so flowView.test.ts checks them on their own.
import type { FlowIn } from './scale'

export type FlowKind = 'page' | 'other' | 'exit'

export interface FlowCol {
  key: string
  label: string
  value: number
  kind: FlowKind
}

// A catch-all must not outweigh the pages it stands in for: "Other pages" is
// drawn at most as tall as the busiest real page of its column, "Left the site"
// at most this share of it. Their counts stay in the label, and the ribbons
// into them still add up to the box (flowLayout).
export const EXIT_SHARE = 0.6

export function flowInputs(cols: FlowCol[][]): FlowIn[][] {
  return cols.map((col) => {
    const top = Math.max(0, ...col.filter((n) => n.kind === 'page').map((n) => n.value))
    return col.map((n) => {
      if (top === 0 || n.kind === 'page') return { key: n.key, value: n.value }
      return { key: n.key, value: n.value, weight: Math.min(n.value, n.kind === 'exit' ? top * EXIT_SHARE : top) }
    })
  })
}

/** How many colours the categorical palette has, in fixed order: a page past the last stays neutral, never cycled. */
export const PAGE_COLORS = 7

/** A page keeps its colour in every column: the order of its first appearance, from the first column on. */
export function pageColors(cols: FlowCol[][]): Map<string, string> {
  const out = new Map<string, string>()
  for (const col of cols) {
    for (const n of col) {
      if (n.kind !== 'page' || out.has(n.key)) continue
      out.set(n.key, out.size < PAGE_COLORS ? `var(--ch-${out.size + 1})` : 'var(--text-3)')
    }
  }
  return out
}

/** Which nodes of a column get a name: the tall ones, and never two on top of each other. */
export function labelled(nodes: { y: number; h: number }[], minGap = 15, minHeight = 6): boolean[] {
  let last = -Infinity
  return nodes.map((n) => {
    const at = n.y + Math.min(n.h, 14) / 2
    if (n.h < minHeight || at - last < minGap) return false
    last = at
    return true
  })
}
