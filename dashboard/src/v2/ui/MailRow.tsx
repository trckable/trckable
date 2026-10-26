// The Briefing's daily email as one small chip: what it does now, and the one way to change it (preview, time, off).
import { Mail } from 'lucide-react'
import './mailLine.css'
import { mailLabel } from './mailLabel'

export function MailRow({ on, onChange }: { on: boolean; onChange: () => void }) {
  const { short, full } = mailLabel(on)
  return (
    <button type="button" className={`gh rpb mailchip${on ? '' : ' off'}`} data-mpv="1" aria-label={full} title={full} onClick={onChange}>
      <Mail size={12} aria-hidden="true" />
      <span>{short}</span>
    </button>
  )
}
