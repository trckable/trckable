// Where Search Console is not set up: one button to Settings, no sentence.
import { Search } from 'lucide-react'
import type { Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { aiCopy } from './copy'

export function ConnectSearch({ site }: { site: Site }) {
  return (
    <div className="ais-connect">
      <button type="button" className="btn" aria-label={aiCopy.connectLabel} onClick={() => openSettings(site, 'search')}>
        <Search size={14} strokeWidth={1.75} aria-hidden="true" />
        {aiCopy.connect}
      </button>
    </div>
  )
}
