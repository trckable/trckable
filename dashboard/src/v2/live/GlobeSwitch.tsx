import { Switch } from '../../components/Switch'
import { copy } from './copy'

/** Live's globe, on or off: a small globe icon, its name and the app's switch. Off is the overview. */
export function GlobeSwitch({ on, onChange, warm }: { on: boolean; onChange: (on: boolean) => void; warm?: object }) {
  return (
    <label className="gsw" {...warm}>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
        <path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" />
      </svg>
      <span>{copy.globe}</span>
      <Switch on={on} label={copy.globeSwitch} onChange={() => onChange(!on)} />
    </label>
  )
}
