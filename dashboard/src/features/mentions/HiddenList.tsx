import { useEffect, useState } from 'react'
import { fail } from '../../lib/api'
import { mentionsApi, type Mention } from './api'
import { trust } from './trustCopy'

/** What was hidden as "Not about us" (or refused by a check), kept so it can come back. Nothing is shown when nothing is hidden. */
export function HiddenList({ site, tick, onRestored }: { site: string; tick: number; onRestored: () => void }) {
  const [list, setList] = useState<Mention[]>([])
  useEffect(() => {
    const c = new AbortController()
    mentionsApi
      .hidden(site, c.signal)
      .then((r) => !c.signal.aborted && setList(r.mentions))
      .catch(() => undefined)
    return () => c.abort()
  }, [site, tick])
  if (list.length === 0) return null
  const restore = (m: Mention) =>
    mentionsApi
      .restore(site, m.id)
      .then(() => {
        setList((l) => l.filter((x) => x.id !== m.id))
        onRestored()
      })
      .catch((e: unknown) => fail(e))
  return (
    <details className="card mp-hidden">
      <summary>{trust.hiddenList(list.length)}</summary>
      <ul>
        {list.map((m) => (
          <li key={m.id}>
            <span>{m.title || m.host}</span>
            <button type="button" className="btn ghost" aria-label={trust.restoreOne(m.title || m.host)} onClick={() => void restore(m)}>
              {trust.restore}
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
