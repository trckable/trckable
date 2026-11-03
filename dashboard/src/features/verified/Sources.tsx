// The source rows of the verified seal: one per badge earned, one dashed Connect row for each kind not earned yet. The seal's own
// panel and the header's one popup (setup done and verified) show the same rows, so they live here.
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { more, type Verified, type VerifiedSource } from '../../lib/apiMore'
import { can } from '../../lib/permissions'
import { openSettings } from '../../lib/settings'
import { copy } from './copy'
import { SourceMark, Tick } from './Marks'
import { missing, providerName, tabOf, working, type Kind } from './model'
import { agoWords, dayWords } from './time'
import './panel.css'

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

/** The owner's copy asks the server again when it opens, so "synced 2 h ago" is as fresh as the click. */
export function useVerified(verified: Verified | undefined, site: { id: string } | undefined, viewer: boolean, on = true): Verified | undefined {
  const [fresh, setFresh] = useState<Verified | undefined>(undefined)
  useEffect(() => {
    if (viewer || !site || !on) return
    let live = true
    more.verified(site.id).then((v) => live && setFresh(v)).catch(() => {})
    return () => {
      live = false
    }
  }, [viewer, site, on])
  return fresh ?? verified
}

export function Sources({ data, site, viewer, close }: { data: Verified | undefined; site?: { id: string; domain: string }; viewer: boolean; close: () => void }) {
  const connect = !viewer && !!site && can('site.settings') ? missing(data) : []
  return (
    <>
      <ul className="vf-rows">
        {working(data).map((s) => (
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
    </>
  )
}
