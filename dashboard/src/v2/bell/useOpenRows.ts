// The rows the bell's menu draws while it is open, and which of them are new or still lit.
import { useState } from 'react'
import { settle, type NoticeRow } from './notices'

export const NONE: ReadonlySet<string> = new Set()

/**
 * The rows the menu draws. Shut, they are the list as it stands. Open, a change in the list behind them changes nothing the
 * person can see (see `settle`): a new row takes its place in the order, and `fresh` names the rows that just arrived.
 */
export function useOpenRows(src: NoticeRow[], open: boolean, gone: ReadonlySet<string>) {
  const [state, setState] = useState({ src, open, gone, rows: src, fresh: NONE, lit: NONE })
  if (state.src !== src || state.open !== open || state.gone !== gone) {
    const live = open && state.open
    const rows = live ? settle(state.rows, src, gone) : src
    const before = new Set(state.rows.map((r) => r.id))
    const fresh = live ? new Set(rows.filter((r) => !before.has(r.id)).map((r) => r.id)) : NONE
    // Opening reads everything at once (the badge is clear for good); the dots of what was unread stay until it shuts.
    const lit = open ? new Set([...(live ? state.lit : NONE), ...src.filter((r) => r.unread && (!live || fresh.has(r.id))).map((r) => r.id)]) : NONE
    setState({ src, open, gone, rows, fresh, lit })
  }
  const rows = state.lit.size ? state.rows.map((r) => (state.lit.has(r.id) && !r.unread ? { ...r, unread: true } : r)) : state.rows
  // A row that was opened is read: its dot goes out at once.
  const unlight = (ids: string[]) => setState((s) => ({ ...s, lit: new Set([...s.lit].filter((id) => !ids.includes(id))) }))
  return { rows, fresh: state.fresh, unlight }
}
