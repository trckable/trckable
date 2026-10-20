// The head of the list beside the globe: how many are online now (the number Live's headline and the "people" pill
// show) and the last half hour as the same small line Live draws, ending on its dot.
import { barsOf } from '../liveModel'
import { LiveLineChart } from '../LiveLineChart'
import { Tick } from '../Tick'
import { copy } from '../copy'

export function GlobeHead({ online, minutes, beat }: { online: number; minutes: number[]; beat: number }) {
  return (
    <div className="ghead">
      <div className="gnow">
        <b className="gbig"><Tick n={online} /></b>
        <span className="mk-quiet">{copy.onlineWord}</span>
      </div>
      <div className="gspark" role="img" aria-label={copy.minsLabel(minutes.reduce((a, m) => a + m, 0))}>
        <LiveLineChart heights={barsOf(minutes).map((x) => x.h)} beat={beat} hits={null} />
      </div>
    </div>
  )
}
