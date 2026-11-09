// The rows the bell's menu draws while it is open, and which of them are new.
import { useState } from 'react'
import { settle, type NoticeRow } from './notices'

export const NONE: ReadonlySet<string> = new Set()

/**
 * The rows the menu draws. Shut, they are the list as it stands. Open, a change in the list behind them changes nothing the
 * person can see (see `settle`): a new row takes its place in the order, and `fresh` names the rows that just arrived.
 */
export function useOpenRows(src: NoticeRow[], open: boolean, gone: ReadonlySet<string>) {
  const [state, setState] = useState({ src, open, gone, rows: src, fresh: NONE })
  if (state.src !== src || state.open !== open || state.gone !== gone) {
    const live = open && state.open
    const rows = live ? settle(state.rows, src, gone) : src
    const before = new Set(state.rows.map((r) => r.id))
    const fresh = live ? new Set(rows.filter((r) => !before.has(r.id)).map((r) => r.id)) : NONE
    setState({ src, open, gone, rows, fresh })
  }
  return { rows: state.rows, fresh: state.fresh }
}
