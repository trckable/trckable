// The chart of the hero with what lives over and under it: the line of words and the Notes button on top, the moments'
// markers, the sources' pills and the busy band over the plot, and the replay's stage around the chart.
import { Suspense, useRef } from 'react'
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
import { useCinema } from '../ui/useCinema'
import { useLockScroll } from '../../components/lockScroll'
import { copy as story } from '../replay/story.copy'
import { ChartControls } from '../ui/ChartControls'
import { capital } from './compare'
import './compareLine.css'
import './briefHead.css'

// The moments, the sources' pills and the busy band over the chart: their own chunk, drawn when the chart is.
const MentionsChip = lazyLoad(() => import('../../features/mentions/MentionsChip'))
const MomentLayer = lazyLoad(() => import('../../features/moments/MomentLayer'))

const TONE = { up: { color: 'var(--mk-green)' }, dn: { color: 'var(--mk-red)' }, none: undefined }

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
  /** Green or red when the line over the chart says how the period stands against the one before. */
  tone?: 'up' | 'dn'
  down: boolean
  notes: number
  onNotes: () => void
  /** The replay tells the period as a story; absent when there is not enough to tell. */
  replay?: ReplayIn
}

export function ChartBlock(p: ChartBlockProps) {
  const query = queryOf(readView(new URLSearchParams(location.search)), p.range)
  const labels = p.series.map((x) => x.t)
  const block = useRef<HTMLDivElement>(null)
  const phase = p.replay?.replay.phase ?? 'off'
  const cinema = useCinema(phase, block)
  useLockScroll(cinema.state !== null)
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
    <>
      {cinema.state && <div className="rp-hold" style={{ height: cinema.slot?.h, marginTop: cinema.slot?.mt }} aria-hidden="true" />}
      {cinema.state && <div className="rp-scrim" data-cinema={cinema.state} onClick={p.replay?.replay.stop} aria-hidden="true" />}
      <div className="chwrap" ref={block} data-rp={p.replay?.replay.phase} data-cinema={cinema.state ?? undefined} {...(phase === 'off' ? {} : { role: 'dialog', 'aria-modal': true, 'aria-label': story.dialog })}>
        <div className="ch-top">
          <span className="mk-quiet" id="chNote" data-tone={p.down ? 'dn' : p.tone} style={TONE[p.down ? 'dn' : (p.tone ?? 'none')]}>
            {p.note}
          </span>
          <span className="mk-quiet" id="chCall" />
          <Suspense fallback={null}>
            <MentionsChip site={p.site} labels={labels} from={p.series[0]?.t.slice(0, 10) ?? p.range.from} to={p.range.to} />
          </Suspense>
        </div>
        <ChartControls
          site={p.site}
          why={p.chart.noCompare}
          legend={
            p.chart.compare && (
              <span className="cc-key" aria-hidden="true">
                <span data-line="now">{copy.legendNow}</span>
                <span data-line="before">{capital(p.chart.compare.name)}</span>
              </span>
            )
          }
          notes={
            <button type="button" className="gh nbtn" data-info="notes" onClick={p.onNotes}>
              {copy.noteBtn(p.notes)}
            </button>
          }
        />
        <div className="chplot">
          {p.chart.compare && (
            <span className="chkey" aria-hidden="true">
              <span data-line="now">{copy.legendNow}</span>
              <span data-line="before">{capital(p.chart.compare.name)}</span>
            </span>
          )}
          {p.chart.noCompare && <span className="chno mk-quiet">{p.chart.noCompare}</span>}
          {p.replay ? <ReplayStage r={p.replay}>{hero}</ReplayStage> : hero}
        </div>
        {p.replay && <ReplayBar r={p.replay} />}
      </div>
    </>
  )
}
