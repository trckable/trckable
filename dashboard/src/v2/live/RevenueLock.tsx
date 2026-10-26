// Today's revenue while no revenue shows: the way in when no payments are connected, and, once a provider is connected, a
// line saying it is waiting for the first payment. One short block, as tall as the rows beside it.
import { shippedNames } from '../../lib/payProviders'
import { lockCopy } from '../ui/lockCopy'

export function RevenueLock({ go, provider, onGo, onHow }: { go: string; provider?: string; onGo: () => void; onHow: () => void }) {
  if (provider)
    return (
      <div className="lrevc" data-lock="rev" data-connected="">
        <p className="lt1">{lockCopy.revWaiting(provider)}</p>
        <p className="lt2">{lockCopy.revWaitingSub}</p>
      </div>
    )
  return (
    <div className="lrevc" data-lock="rev">
      <p className="lt1">{lockCopy.revLine}</p>
      <p className="lt2">{lockCopy.revSub(shippedNames())}</p>
      <div className="lrevb">
        <button type="button" className="lkgo" onClick={onGo}>
          {go}
        </button>
        <button type="button" className="how" onClick={onHow}>
          {lockCopy.how}
        </button>
      </div>
    </div>
  )
}
