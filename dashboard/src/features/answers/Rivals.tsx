// You and the other sites the answers named, as bars: how many of the answers named each.
import { XSec } from '../../v2/ui/XBits'
import { fmtInt } from '../../lib/format'
import { answersCopy as c } from './copy'
import type { AnswersReport } from './api'

export function Rivals({ rivals }: { rivals: AnswersReport['rivals'] }) {
  const top = Math.max(1, ...rivals.map((r) => r.n))
  return (
    <div>
      <XSec a={c.rivalsHead} />
      <div className="an-rivals">
        {rivals.map((r) => (
          <div key={r.name} className={`an-rv${r.you ? ' you' : ''}`}>
            <span>{r.you ? c.you : r.name}</span>
            <span className="bar">
              <i style={{ width: `${(r.n / top) * 100}%` }} />
            </span>
            <b>{fmtInt(r.n)}</b>
          </div>
        ))}
      </div>
    </div>
  )
}
