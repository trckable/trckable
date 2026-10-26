// The bell with nothing in it: a calm "all caught up" in the middle, and the one thing to do (the alert settings).
import { Bell, Check, Settings } from 'lucide-react'
import { useEffect } from 'react'
import { copy } from '../bell/copy'
import type { BellProps } from './BellMenu'

export function BellEmpty({ p, close, old, onOld }: { p: BellProps; close: () => void; old: boolean; onOld: () => void }) {
  const load = p.archive?.load
  // Whether anything is put away is only known once the archive is read: a link to it shows when there is something.
  useEffect(() => load?.(), [load])
  return (
    <div className="nfe">
      <span className="nfe-tile" aria-hidden="true">
        <Bell size={22} strokeWidth={1.7} />
        <i>
          <Check size={9} strokeWidth={3.2} />
        </i>
      </span>
      <b>{copy.emptyTitle}</b>
      <p>{copy.emptyBody}</p>
      <button type="button" className="lk3" onClick={() => { p.onSettings(); close() }}>
        <Settings size={13} strokeWidth={1.8} aria-hidden="true" /> {p.settings}
      </button>
      {p.archive && p.archive.rows.length > 0 && !old && (
        <button type="button" className="lk3 nfe-old" onClick={onOld}>
          {copy.showArchived}
        </button>
      )}
    </div>
  )
}
