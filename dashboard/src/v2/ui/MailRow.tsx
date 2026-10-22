// The quiet line under the Briefing's top about the daily email, and the one way to change it (preview, time, off).
import { copy } from '../briefing/copy'
import './mailLine.css'

export function MailRow({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <p className="mailline">
      <span>{on ? copy.mailOn : copy.mailOff}</span>
      <span aria-hidden="true">{' · '}</span>
      <button type="button" data-mpv="1" onClick={onChange}>
        {copy.change}
      </button>
    </p>
  )
}
