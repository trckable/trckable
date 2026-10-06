// The prototype's one lazy chunk: the format toggle, and Glance itself when
// that is the format on show. Dashboard hands over through StorySlot.
import { rememberFormat, type Format } from './flag'
import { setView, type ViewState } from '../../lib/url'
import GlanceView, { type GlanceProps } from './GlanceView'
import { FormatToggle } from './Toggle'
import './glance.css'

export default function GlanceHost({ format, ...p }: GlanceProps & { format: Format; view: ViewState }) {
  const pick = (f: Format) => {
    rememberFormat(f)
    setView({ fmt: f === 'glance' ? 'glance' : undefined })
  }
  return (
    <>
      <FormatToggle format={format} onPick={pick} />
      {format === 'glance' && <GlanceView {...p} />}
    </>
  )
}
