// What the cards under Live hold while their figures are on the way: the shape of what will land (a big number and its
// label, a gauge and the thirty days, rows of a list, a ring), so nothing moves when it does.
import { Bone } from '../ui/Bone'
import { copy } from './copy'

export type CardKind = 'analytics' | 'rows' | 'speed' | 'ai'

function Figure() {
  return (
    <div className="lskcol">
      <Bone w={88} h={44} />
      <Bone w={120} h={13} />
    </div>
  )
}

function Body({ kind }: { kind: CardKind }) {
  if (kind === 'speed') {
    return (
      <>
        <Bone w={200} h={108} />
        <Bone w="100%" h={26} />
      </>
    )
  }
  if (kind === 'ai') {
    return (
      <div className="lskrow">
        <Figure />
        <Bone w={84} h={84} round />
      </div>
    )
  }
  return (
    <>
      {kind === 'analytics' && (
        <div className="lskhead">
          <Bone w={120} h={30} />
        </div>
      )}
      {[0, 1, 2, 3, 4].map((i) => (
        <Bone key={i} w={`${100 - i * 12}%`} h={28} />
      ))}
    </>
  )
}

export function CardSkeleton({ kind }: { kind: CardKind }) {
  return (
    <div className={`lsk ${kind}`} role="status" aria-busy="true" aria-label={copy.loading}>
      <Body kind={kind} />
    </div>
  )
}
