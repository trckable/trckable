// The chart of the hero with what lives over and under it: the line of words and the Notes button on top, the moments'
// markers, the sources' pills and the busy band over the plot, and the replay's stage around the chart.
import { Suspense } from 'react'
import { lazyLoad } from '../../lib/lazyLoad'
import { queryOf } from '../../lib/dashQuery'
import { isShared } from '../../lib/me'
import { readView } from '../../lib/url'
import type { Bucket, Point, Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { copy } from './copy'
import { HeroChart, type ChartIn } from '../ui/DayChart'
import { ReplayStage, type ReplayIn } from '../ui/ReplayStage'
import { ReplayBar } from '../ui/ReplayBar'

// The moments, the sources' pills and the busy band over the chart: their own chunk, drawn when the chart is.
const MentionsChip = lazyLoad(() => import('../../features/mentions/MentionsChip'))
const MomentLayer = lazyLoad(() => import('../../features/moments/MomentLayer'))

export interface ChartBlockProps {
  site: Site
  range: Range
  chart: ChartIn
  at: number | null
  onAt: (i: number | null) => void
  series: readonly Point[]
  bucket: Bucket
  money?: (minor: number) => string
  note: string
  down: boolean
  notes: number
  onNotes: () => void
  /** The replay tells the period as a story; absent when there is not enough to tell. */
  replay?: ReplayIn
}

export function ChartBlock(p: ChartBlockProps) {
  const query = queryOf(readView(new URLSearchParams(location.search)), p.range)
  const labels = p.series.map((x) => x.t)
  const hero = (
    <HeroChart
      c={p.chart}
      at={p.at}
      onAt={p.onAt}
      layer={
        isShared()
          ? undefined
          : (g) => (
              <Suspense fallback={null}>
                <MomentLayer g={g} site={p.site} query={query} labels={labels} series={p.series} bucket={p.bucket} money={p.money ?? (() => '')} />
              </Suspense>
            )
      }
    />
  )
  return (
    <div className="chwrap" data-rp={p.replay?.replay.phase}>
      <div className="ch-top">
        <span className="mk-quiet" id="chNote" style={p.down ? { color: 'var(--mk-red)' } : undefined}>
          {p.note}
        </span>
        <span className="mk-quiet" id="chCall" />
        <Suspense fallback={null}>
          <MentionsChip site={p.site} labels={labels} from={p.series[0]?.t.slice(0, 10) ?? p.range.from} to={p.range.to} />
        </Suspense>
        <button type="button" className="gh nbtn" data-info="notes" onClick={p.onNotes}>
          {copy.noteBtn(p.notes)}
        </button>
        {p.replay && <ReplayBar r={p.replay} />}
      </div>
      {p.replay ? <ReplayStage r={p.replay}>{hero}</ReplayStage> : hero}
    </div>
  )
}
