// Before any tagged visit: a sample link to copy, and the bars such a list would draw, faint.
import { Link2 } from 'lucide-react'
import { CopyButton } from '../sharelinks/CopyButton'
import { copy } from './copy'
import { LinksTip } from './LinksTip'
import { sampleLink } from './model'

export function Empty({ domain }: { domain: string }) {
  const link = sampleLink(domain)
  return (
    <div className="yl-empty">
      <div className="yl-sample">
        <Link2 size={16} strokeWidth={1.75} aria-hidden="true" />
        <code className="num">{link}</code>
        <CopyButton icon text={'https://' + link} label={copy.copyLabel} toastText={copy.copied} />
        <LinksTip text={copy.emptyTip} align="right" />
      </div>
      <div className="yl-ghost" aria-hidden="true">
        {[86, 52, 24].map((w) => (
          <div key={w}>
            <i style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}
