// What the Verified seal opens: one row per badge earned (its mark, its name, what
// it says, a tick), one dashed Connect row for each kind not earned yet (Payments,
// Search), and when it was last checked. The owner's panel asks the server again
// when it opens, so "synced 2 h ago" is as fresh as the click.
import type { Verified } from '../../lib/apiMore'
import { copy } from './copy'
import { Seal } from './Marks'
import { earned, lastChecked } from './model'
import { Sources, useVerified } from './Sources'
import { whenWords } from './time'
import './panel.css'

interface Props {
  verified?: Verified
  site?: { id: string; domain: string; timezone?: string }
  viewer: boolean
  brand: boolean
  close: () => void
}

export default function Panel({ verified, site, viewer, brand, close }: Props) {
  const data = useVerified(verified, site, viewer)
  const names = earned(data).map((k) => copy.names[k]).join(', ')
  const when = lastChecked(data)
  return (
    <div className="vf-panel">
      <div className="vf-head">
        <span className="vf-seal">
          <Seal size={18} />
        </span>
        <span className="vf-txt">
          <b>{viewer ? copy.viewerTitle : copy.title(names)}</b>
          <small>{viewer ? copy.viewerSub(names) : copy.sub}</small>
        </span>
      </div>
      <Sources data={data} site={site} viewer={viewer} close={close} />
      <div className="vf-foot">
        <span>{when ? copy.checked(whenWords(when, site?.timezone)) : ''}</span>
        {viewer && brand && (
          <a href="https://trckable.com/?ref=verified" target="_blank" rel="noopener">
            {copy.verifyOwn} →
          </a>
        )}
      </div>
    </div>
  )
}
