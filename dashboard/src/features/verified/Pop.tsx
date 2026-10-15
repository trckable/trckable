// The panel under the seal, anchored to it: Escape, a click outside and the
// page moving close it (AnchoredPop), and focus goes back to the seal.
import type { RefObject } from 'react'
import { AnchoredPop } from '../../components/AnchoredPop'
import type { PillProps } from './VerifiedPill'
import { copy } from './copy'
import Panel from './Panel'
import './panel.css'

type Props = Required<Pick<PillProps, 'viewer' | 'brand'>> & Pick<PillProps, 'verified' | 'site'> & { anchor: RefObject<HTMLElement | null>; onClose: () => void }

export default function Pop({ anchor, onClose, ...panel }: Props) {
  return (
    <AnchoredPop anchor={anchor} label={copy.panel} className="vf-pop" maxHeight={520} onClose={onClose}>
      {(close) => <Panel {...panel} close={close} />}
    </AnchoredPop>
  )
}
