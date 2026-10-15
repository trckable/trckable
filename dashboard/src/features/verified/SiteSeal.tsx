// A small seal beside a site in the switcher: at least one source works for it.
import type { Verified } from '../../lib/api'
import { copy } from './copy'
import { Seal } from './Marks'
import { working } from './model'
import './verified.css'

export function SiteSeal({ verified }: { verified?: Verified }) {
  if (working(verified).length === 0) return null
  return (
    <span className="vf-seal-dot" role="img" aria-label={copy.seal} title={copy.seal}>
      <Seal size={13} />
    </span>
  )
}
