// The surge card's "More": the shape of the last hour with the climb marked,
// and the story in lines (SurgeCard.tsx puts it under the first two).
import { Chart } from '../../components/SideCard/Chart'
import { countryName } from '../../lib/format'
import { startSlice, storyLines, type Surge } from './surge'

/** The last hour as a small line, the usual as a dashed level and the start as a dot. */
export function SurgeShape({ surge }: { surge: Surge }) {
  const st = surge.story
  if (!st) return null
  return <Chart spec={{ values: st.series, base: surge.usual, hl: startSlice(st) }} />
}

export function SurgeStory({ surge, tz }: { surge: Surge; tz: string }) {
  return (
    <>
      {storyLines(surge, tz, countryName).map((l) => (
        <p key={l} className="muted sg-body">
          {l}
        </p>
      ))}
    </>
  )
}
