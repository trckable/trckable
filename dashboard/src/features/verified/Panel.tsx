// What the Verified seal opens: one row per badge earned (its mark, its name, what
// it says, a tick), one dashed Connect row for each kind not earned yet (Payments,
// Search), and when it was last checked. The owner's panel asks the server again
// when it opens, so "synced 2 h ago" is as fresh as the click.
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { more, type Verified, type VerifiedSource } from '../../lib/apiMore'
import { canChange } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { copy } from './copy'
import { SourceMark, Seal, Tick } from './Marks'
import { earned, lastChecked, missing, providerName, tabOf, working, type Kind } from './model'
import { agoWords, dayWords, whenWords } from './time'

interface Props {
  verified?: Verified
  site?: { id: string; domain: string }
  viewer: boolean
  brand: boolean
  close: () => void
}

const kindOf = (s: VerifiedSource): Kind => (s.kind === 'gsc' ? 'search' : 'payments')

/** The line under a badge's name, for who is reading. */
function detailOf(s: VerifiedSource, viewer: boolean): string {
  const provider = providerName(s.provider)
  if (kindOf(s) === 'search') return viewer ? copy.okSearchViewer(agoWords(s.checked)) : copy.okSearch(dayWords(s.since), agoWords(s.checked))
  return viewer ? copy.okPaymentsViewer(provider) : copy.okPayments(agoWords(s.checked))
}

function Row({ s, viewer }: { s: VerifiedSource; viewer: boolean }) {
  return (
    <li className="vf-row">
      <span className="vf-ico">
        <SourceMark s={s} size={16} />
      </span>
      <span className="vf-txt">
        <b>{copy.names[kindOf(s)]}</b>
        <small>{detailOf(s, viewer)}</small>
      </span>
      <span className="vf-state ok">
        <Tick size={14} />
      </span>
    </li>
  )
}

export default function Panel({ verified, site, viewer, brand, close }: Props) {
  const [fresh, setFresh] = useState<Verified | undefined>(undefined)
  useEffect(() => {
    if (viewer || !site) return
    let live = true
    more.verified(site.id).then((v) => live && setFresh(v)).catch(() => {})
    return () => {
      live = false
    }
  }, [viewer, site])
  const data = fresh ?? verified
  const rows = working(data)
  const names = earned(data).map((k) => copy.names[k]).join(', ')
  const connect = !viewer && !!site && canChange() ? missing(data) : []
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
      <ul className="vf-rows">
        {rows.map((s) => (
          <Row key={s.kind} s={s} viewer={viewer} />
        ))}
      </ul>
      {site &&
        connect.map((k) => (
          <button
            key={k}
            type="button"
            className="vf-connect"
            onClick={() => {
              close()
              openSettings(site, tabOf(k))
            }}
          >
            <span className="vf-ico">
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="vf-txt">
              <b>{copy.names[k]}</b>
              <small>{copy.connectWhat[k]}</small>
            </span>
            <span className="vf-btn">{copy.connect}</span>
          </button>
        ))}
      <div className="vf-foot">
        <span>{when ? copy.checked(whenWords(when)) : ''}</span>
        {viewer && brand && (
          <a href="https://trckable.com/?ref=verified" target="_blank" rel="noopener">
            {copy.verifyOwn} →
          </a>
        )}
      </div>
    </div>
  )
}
