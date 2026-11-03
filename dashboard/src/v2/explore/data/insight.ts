// The one line over a table: the biggest real move between the two periods, or nothing. Pure: insight.test.ts.
import { fmtInt } from '../../../lib/format'
import { mult } from '../../briefing/model'
import { midTruncate } from '../../../features/signals/surge'
import { copy } from '../copy'
import type { Row } from '../types'

/** A move under this many people, on both sides, is noise. */
const ENOUGH = 10

export function insightOf(rows: Row[]): string | null {
  const moved = rows.filter((r) => r.st && Math.max(r.v, r.c ?? 0) >= ENOUGH)
  if (!moved.length) return null
  const top = moved.reduce((a, b) => (Math.abs(b.v - (b.c ?? 0)) > Math.abs(a.v - (a.c ?? 0)) ? b : a))
  const was = top.c ?? 0
  // A long address keeps its start and its end, so the sentence stays one or two lines.
  const name = top.name === '/' ? copy.homePage : midTruncate(top.name, 48)
  if (was <= 0) return copy.insNew(name, fmtInt(top.v))
  if (top.v <= 0) return copy.insNone(name, fmtInt(was))
  const pct = Math.abs(Math.round((top.v / was - 1) * 100))
  return copy.insMoved(name, top.v < was ? 'fell' : 'rose', top.v / was >= 2 ? mult(top.v / was) : `${pct}%`, fmtInt(was), fmtInt(top.v))
}
