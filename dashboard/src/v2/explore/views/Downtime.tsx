// The incidents of the period, one row each. With none it draws nothing: "no downtime" is not worth a row of its own
// (the Uptime card says it where it is shown).
import { copy } from '../copy'
import type { Down } from '../types'
import { XSec } from '../../ui/XBits'

export function Downtime({ down }: { down: Down[] }) {
  if (down.length === 0) return null
  return (
    <>
      <XSec a={copy.downtime} b={copy.incidents(down.length)} />
      {down.map((i) => (
        <div key={i.from} className="sale">
          <span className="mk-tag refund">{copy.down}</span>
          <span className="gn">{copy.downSpan(i.from, i.to)}</span>
          <span className="amt">{copy.minutes(i.min)}</span>
        </div>
      ))}
    </>
  )
}
