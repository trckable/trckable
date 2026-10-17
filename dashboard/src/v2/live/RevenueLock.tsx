// Today's revenue while no payments are connected: one short block with the way in, as tall as the rows beside it.
import { lockCopy } from '../ui/lockCopy'

export function RevenueLock({ go, onGo, onHow }: { go: string; onGo: () => void; onHow: () => void }) {
  return (
    <div className="lrevc" data-lock="rev">
      <p className="lt1">{lockCopy.revLine}</p>
      <p className="lt2">{lockCopy.revSub}</p>
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
