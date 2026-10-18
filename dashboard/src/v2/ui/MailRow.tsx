// The line at the bottom of the Briefing about tomorrow's email: what it will say, a preview, and the switch.
import { copy } from '../briefing/copy'

export function MailRow({ on, onPreview, onManage, onToggle }: { on: boolean; onPreview: () => void; onManage: () => void; onToggle: () => void }) {
  return (
    <div className="mailrow">
      <span className="mi2">{'\u2709'}</span>
      <span className="mt">
        <b>{on ? copy.mailOn : copy.mailOff}</b>
      </span>
      <button type="button" className="gh" data-mpv="1" onClick={onPreview}>
        {copy.preview}
      </button>
      <button type="button" className="gh" onClick={onManage}>
        {copy.manage}
      </button>
      <button type="button" className="gh" data-mail="1" onClick={onToggle}>
        {on ? copy.turnOffMail : copy.turnOnMail}
      </button>
    </div>
  )
}
