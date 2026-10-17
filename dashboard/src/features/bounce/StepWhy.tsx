// Step 3: one picture for each kind of cause present, side by side on a wide
// screen and stacked on a phone.
import type { BounceCause } from '../../lib/apiMore'
import { Handset, PageFrame, SpeedGauge } from './Visuals'

const VISUAL = { page: PageFrame, speed: SpeedGauge, source_device: Handset }

export function StepWhy({ causes }: { causes: BounceCause[] }) {
  return (
    <div className="bg-step bg-why">
      {causes.map((c) => {
        const Visual = VISUAL[c.kind]
        return (
          <div key={c.kind + c.label} className="bg-sub">
            <Visual c={c} />
          </div>
        )
      })}
    </div>
  )
}
