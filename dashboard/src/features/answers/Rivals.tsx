// You and the other sites the answers named, as bars: how many of the answers named each.
import { XSec } from '../../v2/ui/XBits'
import { fmtInt } from '../../lib/format'
import { answersCopy as c } from './copy'

type Bar = { name: string; seen: number; you?: boolean }

export function Rivals({ you, rivals }: { you: number; rivals: { name: string; seen: number }[] }) {
  const rows: Bar[] = [{ name: c.you, seen: you, you: true }, ...rivals]
  const top = Math.max(1, ...rows.map((r) => r.seen))
  return (
    <div>
      <XSec a={c.rivalsHead} />
      <div className="an-rivals">
        {rows.map((r) => (
          <div key={r.name} className={`an-rv${r.you ? ' you' : ''}`}>
            <span>{r.name}</span>
            <span className="bar">
              <i style={{ width: `${(r.seen / top) * 100}%` }} />
            </span>
            <b>{fmtInt(r.seen)}</b>
          </div>
        ))}
      </div>
    </div>
  )
}
