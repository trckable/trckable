import { Compare } from './Compare'
import { IncidentTimeline } from './IncidentTimeline'
import { LineBlock } from './LineBlock'
import { MentionsList } from './MentionsList'
import { NumberCard } from './NumberCard'
import { RankedTable } from './RankedTable'
import type { Block as B } from './types'

/** One block, drawn by its type. */
export function Block({ block }: { block: B }) {
  switch (block.type) {
    case 'number':
      return <NumberCard b={block} />
    case 'line':
      return <LineBlock b={block} />
    case 'ranked':
      return <RankedTable b={block} />
    case 'incidents':
      return <IncidentTimeline b={block} />
    case 'mentions':
      return <MentionsList b={block} />
    case 'compare':
      return <Compare b={block} />
  }
}
