// The rows the bell's menu draws while it is open, and which of them are new.
import { useState } from 'react'
import { settle, type NoticeRow } from './notices'

export const NONE: ReadonlySet<string> = new Set()

/**
 * The rows the menu draws. Shut, they are the list as it stands. Open, a change in the list behind them changes nothing the
 * person can see (see `settle`): a new row takes its place in the order, and `fresh` names the rows that just arrived.
 * Another scope (a team, other sites) starts over: nothing of the last one's rows stays in an open menu.
 */
export function useOpenRows(src: NoticeRow[], open: boolean, gone: ReadonlySet<string>, scope = '') {
  const [state, setState] = useState({ src, open, gone, scope, rows: src, fresh: NONE })
  if (state.src !== src || state.open !== open || state.gone !== gone || state.scope !== scope) {
    const live = open && state.open && state.scope === scope
    const rows = live ? settle(state.rows, src, gone) : src
    const before = new Set(state.rows.map((r) => r.id))
    const fresh = live ? new Set(rows.filter((r) => !before.has(r.id)).map((r) => r.id)) : NONE
    setState({ src, open, gone, scope, rows, fresh })
  }
  return { rows: state.rows, fresh: state.fresh }
}
