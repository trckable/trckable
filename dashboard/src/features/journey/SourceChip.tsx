// A visit's entry source as a chip: its mark and "Search · google.com". With
// a filter handler it is a button that narrows the dashboard to that source.
import { SourceMark } from '../../components/visitor/SourceMark'
import { copy } from './copy'

export type OnFilter = (dim: string, value: string) => void

export function SourceChip({ channel, referrer, onFilter }: { channel: string; referrer: string; onFilter?: OnFilter }) {
  const label = copy.source(channel, referrer)
  const body = (
    <>
      <SourceMark channel={channel} referrer={referrer} size={18} />
      <span className="jr-chip-text">{label}</span>
    </>
  )
  if (!onFilter) return <span className="jr-chip">{body}</span>
  const pick = () => (referrer ? onFilter('referrer', referrer) : onFilter('channel', channel))
  return (
    <button type="button" className="jr-chip" title={copy.filterSource(label)} onClick={pick}>
      {body}
    </button>
  )
}
