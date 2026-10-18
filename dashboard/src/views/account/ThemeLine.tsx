// The theme line of the account window: Auto follows the device. It is also
// in the ⋯ menu; both read the same value (lib/theme.ts).
import { SunMoon } from 'lucide-react'
import { copy } from '../../components/itemsCopy'
import { THEMES, useTheme } from '../../lib/theme'
import { Line } from '../AccountLine'

export function ThemeLine() {
  const [theme, pick] = useTheme()
  return (
    <Line icon={SunMoon} label="Theme" hint="Auto follows your device">
      <div className="seg" role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <button key={t} type="button" aria-pressed={theme === t} onClick={() => pick(t)}>
            {copy.themes[t]}
          </button>
        ))}
      </div>
    </Line>
  )
}
