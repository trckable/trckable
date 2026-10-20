// What a tool answers with, as typed blocks the chat draws inline. The server
// builds them from the same queries the dashboard reads; the dashboard only
// draws them, so a number on a block is the number of the page it came from.
import type { Mention } from '../mentions/api'
import type { Incident } from '../incidents/api'

export const KINDS = ['number', 'line', 'ranked', 'incidents', 'mentions', 'compare'] as const
export type BlockKind = (typeof KINDS)[number]

/** How a number is said: a count, a share (0 to 100), minor units of a currency, seconds, milliseconds. */
export type Unit = 'count' | 'percent' | 'money' | 'duration' | 'ms'
export const UNITS: readonly Unit[] = ['count', 'percent', 'money', 'duration', 'ms']

export interface Amount {
  unit: Unit
  /** Money only. */
  currency?: string
  exponent?: number
}

export interface Period {
  from: string
  to: string
  /** "This week", as the question named it. */
  label: string
}

/** Where the numbers came from: the endpoint the dashboard reads and the params it was read with. */
export interface Source {
  endpoint: string
  params: Record<string, string>
}

interface Base {
  title: string
  period?: Period
  source?: Source
  /** A path inside the dashboard that shows the same thing: a secondary link, never the answer. */
  explore?: string
}

export interface NumberBlock extends Base {
  type: 'number'
  data: Amount & { value: number; previous?: number; /** Lower is better. */ invert?: boolean }
}

export interface LineBlock extends Base {
  type: 'line'
  data: Amount & { points: number[]; /** The first and the last point's name ("Oct 1", "Oct 7"). */ labels?: [string, string] }
}

export interface RankedRow {
  label: string
  value: number
  /** What the comparison period had. */
  before?: number
}

export interface RankedBlock extends Base {
  type: 'ranked'
  data: Amount & { rows: RankedRow[] }
}

export interface IncidentsBlock extends Base {
  type: 'incidents'
  data: {
    incidents: Pick<Incident, 'id' | 'kind' | 'started_at' | 'ended_at' | 'cause'>[]
    /** The share of the period the site was up; null when too little of it was watched to say. */
    uptime: number | null
  }
}

export type BlockMention = Pick<Mention, 'id' | 'source' | 'url' | 'title' | 'author' | 'points' | 'comments' | 'front' | 'kind' | 'posted_at' | 'visitors'>

export interface MentionsBlock extends Base {
  type: 'mentions'
  data: { mentions: BlockMention[] }
}

export interface CompareSide {
  label: string
  value: number
}

export interface CompareBlock extends Base {
  type: 'compare'
  data: Amount & { current: CompareSide; previous: CompareSide; invert?: boolean }
}

export type Block = NumberBlock | LineBlock | RankedBlock | IncidentsBlock | MentionsBlock | CompareBlock

/** A tool's whole answer: the blocks, and what could not be read (said as it is, never filled in). */
export interface BlocksReply {
  blocks: Block[]
  missing?: string
}
