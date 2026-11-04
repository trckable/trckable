// A visit's entry source as a chip: its mark and "Search · google.com". With
// a filter handler it is a button that narrows the dashboard to that source.
import { SourceMark } from '../../components/visitor/SourceMark'
import type { Thing } from '../../v2/explore/thing'
import { copy } from './copy'

/** A click on a thing in a visit, with the moment of the visit it was in (unix ms): the dashboard opens that thing over a period that holds it. */
export type OnFilter = (thing: Thing, at: number) => void

export function SourceChip({ channel, referrer, at, onFilter }: { channel: string; referrer: string; at?: number; onFilter?: OnFilter }) {
  const label = copy.source(channel, referrer)
  const body = (
    <>
      <SourceMark channel={channel} referrer={referrer} size={18} />
      <span className="jr-chip-text">{label}</span>
    </>
  )
  if (!onFilter) return <span className="jr-chip">{body}</span>
  const pick = () => onFilter({ kind: 'source', channel, referrer }, at ?? Date.now())
  return (
    <button type="button" className="jr-chip" title={copy.filterSource(label)} onClick={pick}>
      {body}
    </button>
  )
}
