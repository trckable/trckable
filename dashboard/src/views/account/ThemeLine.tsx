// The theme line of the account window: System follows the device. It is also
// in the ⋯ menu; both read the same value (lib/theme.ts).
import { SunMoon } from 'lucide-react'
import { THEMES, useTheme } from '../../lib/theme'
import { Line } from '../AccountLine'

export function ThemeLine() {
  const [theme, pick] = useTheme()
  return (
    <Line icon={SunMoon} label="Theme" hint="System follows your device">
      <div className="seg" role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <button key={t} type="button" aria-pressed={theme === t} onClick={() => pick(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    </Line>
  )
}
