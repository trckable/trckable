// The dialog's secondary way to share: a read-only link to the site. It is the
// same form as Settings → Sharing (features/sharelinks): named after the site,
// revenue off, no end date, with the password, the end date and embedding
// under More. What the link may show is decided on the server.
import { ArrowLeft, Link2 } from 'lucide-react'
import { useState } from 'react'
import type { Site } from '../../lib/apiMore'
import { Created } from '../sharelinks/Created'
import { NewLink, type Made } from '../sharelinks/NewLink'
import { copy } from './copy'
import { LinkPreview } from './LinkPreview'
import { LookPanel } from './LookPanel'
import { useLook } from './useLook'
import '../sharelinks/sharelinks.css'

export function LinkPanel({ site, onBack }: { site: Site; onBack: () => void }) {
  const [made, setMade] = useState<Made | null>(null)
  const look = useLook(site.id)
  return (
    <div className="sd-linkgrid">
      <div className="sd-link sl-card">
        <button type="button" className="btn ghost sd-back" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          {copy.back}
        </button>
        <h3>
          <Link2 size={17} strokeWidth={1.8} aria-hidden="true" />
          {copy.linkTitle}
        </h3>
        {made ? <Created made={made} domain={site.domain} onDone={onBack} /> : <NewLink bare site={site} onClose={onBack} onMade={setMade} />}
        <LookPanel state={look} />
        <span className="faint sd-manage">{copy.manage}</span>
      </div>
      <LinkPreview site={site} state={look} />
    </div>
  )
}
