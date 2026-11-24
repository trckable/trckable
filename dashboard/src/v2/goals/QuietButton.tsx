// "Only tell me when it stands out": a person's choice for one goal, kept on the server, so the bell keeps a usual day of it out of its card.
import { useState } from 'react'
import { toast } from '../../components/Toast'
import { more } from '../../lib/apiMore'
import { stand } from './standCopy'

export function QuietButton({ site, goal, quiet, onChange }: { site: string; goal: string; quiet: boolean; onChange?: (quiet: boolean) => void }) {
  const [on, setOn] = useState(quiet)
  const [busy, setBusy] = useState(false)
  const flip = () => {
    setBusy(true)
    more
      .setGoalQuiet(site, goal, !on)
      .then(() => {
        setOn(!on)
        onChange?.(!on)
      })
      .catch(() => toast(stand.quietFailed, 'error'))
      .finally(() => setBusy(false))
  }
  return (
    <button type="button" className="gs-quiet" aria-pressed={on} disabled={busy} onClick={flip}>
      {on ? stand.quietOn : stand.quietOff}
    </button>
  )
}
