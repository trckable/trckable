// "4/9 set up" in the site menu, for a header too narrow to hold the ring: it opens the ring's panel.
import { openSetup, useSetupWords } from '../setup/summary'

export function SetupLine({ close }: { close: () => void }) {
  const words = useSetupWords()
  if (!words) return null
  return (
    <button type="button" className="mi setupline" onClick={() => { close(); openSetup() }}>
      <span className="mt2">
        <div className="nm">{words}</div>
      </span>
    </button>
  )
}
