// The status of one answer, drawn with the logo's ghost: solid when the answer names you and links to you, outlined when
// only one of the two is true, dashed and faded when the assistant forgot you. The words say the state too; colour
// is never the only signal.
import { GHOST } from '../../brand/logo'
import { answersCopy } from './copy'
import type { State } from './api'
import './answers.css'

export function GhostMark({ state, size = 16, label, asking = false }: { state: State; size?: number; label?: string; asking?: boolean }) {
  const words = asking ? answersCopy.asking : (label ?? answersCopy.state[state])
  const kind = asking ? 'ask' : state
  return (
    <svg className={`gm gm-${kind}`} width={size} height={size} viewBox="8 7 48 48" role="img" aria-label={words}>
      <title>{words}</title>
      <path className="gm-body" d={GHOST} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle className="gm-eye" cx="25.5" cy="29" r="3.2" />
      <circle className="gm-eye" cx="38.5" cy="29" r="3.2" />
    </svg>
  )
}
