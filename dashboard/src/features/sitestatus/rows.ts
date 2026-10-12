// The checks as lines: each passes or fails and says so in a sentence, the
// failures with what to do. The homepage's own wording is the install check's
// (features/install/outcome.ts), so the two never say different things.
import type { InstallCheck } from '../../lib/api'
import { outcomeOf } from '../install/outcome'
import { copy } from './copy'

export interface Row {
  id: 'page' | 'tag' | 'script'
  label: string
  ok: boolean
  text: string
}

export function rowsOf(c: InstallCheck, domain: string): Row[] {
  if (c.error) return [{ id: 'page', label: copy.page, ok: false, text: c.error }]
  const rows: Row[] = [{ id: 'page', label: copy.page, ok: true, text: copy.pageOk(c.status ?? 200, c.ms ?? 0) }]
  const tag = outcomeOf(c, domain)
  rows.push({ id: 'tag', label: copy.tag, ok: tag.kind === 'site', text: tag.text })
  if (c.script) {
    const st = c.script_status ?? 0
    const ok = st >= 200 && st < 400
    rows.push({ id: 'script', label: copy.script, ok, text: ok ? copy.scriptOk(st) : copy.scriptBad(c.script, st) })
  }
  return rows
}

/** One plain sentence on the likely cause: the first check that failed says it, else the visits are simply missing. */
export function causeOf(rows: Row[] | undefined, down: boolean): string {
  if (down) return copy.causeDown
  if (!rows) return copy.causeWait
  return rows.find((r) => !r.ok)?.text ?? copy.causeFine
}
