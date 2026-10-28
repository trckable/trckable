// A robot's visits that went wrong: the refused and the broken added up, red when there is any, and the title says which is which.
import { fmtInt } from '../../lib/format'
import { aiCopy } from './copy'

export function FailedCell({ blocked, broken }: { blocked: number; broken: number }) {
  const n = blocked + broken
  if (n === 0) return <>{aiCopy.noFailures}</>
  return (
    <span style={{ color: 'var(--mk-red)' }} title={aiCopy.failTitle(blocked, broken)}>
      {fmtInt(n)}
    </span>
  )
}
