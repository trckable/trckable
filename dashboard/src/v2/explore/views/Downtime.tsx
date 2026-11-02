// The incidents of the period, one row each. With none it draws nothing: "no downtime" is not worth a row of its own
// (the Uptime card says it where it is shown).
import { copy } from '../copy'
import type { Down } from '../types'
import { plainSpan } from '../../../lib/plainSpan'
import { XSec } from '../../ui/XBits'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "11-01 17:27" as "Nov 1, 17:27"; anything else stays as it came. */
const when = (s: string) => {
  const m = /^(\d\d)-(\d\d) (\d\d:\d\d)$/.exec(s)
  return m ? `${MONTHS[+m[1] - 1]} ${+m[2]}, ${m[3]}` : s
}

export function Downtime({ down }: { down: Down[] }) {
  if (down.length === 0) return null
  return (
    <>
      <XSec a={copy.downtime} b={copy.incidents(down.length)} />
      {down.map((i) => (
        <div key={i.from} className="sale">
          <span className="mk-tag refund">{copy.down}</span>
          <span className="gn">{copy.downSpan(when(i.from), when(i.to).replace(/^.*, /, ''))}</span>
          <span className="amt">{plainSpan(i.min * 60)}</span>
        </div>
      ))}
    </>
  )
}
