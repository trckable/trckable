// What the Verified seal opens: one row per source (its mark, its name, what it
// says, a tick), one dashed Connect row for the payment providers not set up
// yet, and when it was last checked. The owner's panel asks the server again
// when it opens, so "synced 2 h ago" is as fresh as the click.
import { TriangleAlert, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { more, type Verified, type VerifiedSource } from '../../lib/apiMore'
import { canChange } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { copy } from './copy'
import { SourceMark, Seal, Tick } from './Marks'
import { lastChecked, missingProviders, providerName, working } from './model'
import { agoWords, dayWords, whenWords } from './time'

interface Props {
  verified?: Verified
  site?: { id: string; domain: string }
  viewer: boolean
  brand: boolean
  close: () => void
}

function nameOf(s: VerifiedSource): string {
  if (s.kind === 'snippet') return copy.name.snippet
  if (s.kind === 'gsc') return copy.name.gsc
  return providerName(s.provider)
}

/** Why a source that stopped working is not counted. */
function whyNot(s: VerifiedSource): string {
  if (s.kind === 'snippet') return copy.notSnippet
  if (s.kind === 'gsc') return copy.notSearch
  return copy.notPayments(providerName(s.provider))
}

/** The line under a source's name, for who is reading. */
function detailOf(s: VerifiedSource, viewer: boolean): string {
  const provider = providerName(s.provider)
  if (!s.ok) return whyNot(s)
  switch (s.kind) {
    case 'snippet':
      return viewer ? copy.okSnippetViewer : copy.okSnippet
    case 'gsc':
      return viewer ? copy.okSearchViewer(agoWords(s.checked)) : copy.okSearch(dayWords(s.since), agoWords(s.checked))
    default:
      return viewer ? copy.okPaymentsViewer(provider) : copy.okPayments(agoWords(s.checked))
  }
}

function Row({ s, viewer }: { s: VerifiedSource; viewer: boolean }) {
  return (
    <li className={'vf-row' + (s.ok ? '' : ' off')}>
      <span className="vf-ico">
        <SourceMark s={s} size={16} />
      </span>
      <span className="vf-txt">
        <b>{nameOf(s)}</b>
        <small>{detailOf(s, viewer)}</small>
      </span>
      <span className={'vf-state ' + (s.ok ? 'ok' : 'warn')}>{s.ok ? <Tick size={14} /> : <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />}</span>
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
  const n = working(data).length
  const connect = !viewer && !!site && canChange() ? missingProviders(data) : []
  const when = lastChecked(data)
  return (
    <div className="vf-panel">
      <div className="vf-head">
        <span className="vf-seal">
          <Seal size={18} />
        </span>
        <span className="vf-txt">
          <b>{viewer ? copy.viewerTitle : copy.title(n)}</b>
          <small>{viewer ? copy.viewerSub(n) : copy.sub}</small>
        </span>
      </div>
      <ul className="vf-rows">
        {(data?.sources ?? []).map((s, i) => (
          <Row key={`${s.kind}${s.provider ?? ''}${i}`} s={s} viewer={viewer} />
        ))}
      </ul>
      {connect.length > 0 && site && (
        <button
          type="button"
          className="vf-connect"
          onClick={() => {
            close()
            openSettings(site, 'payments')
          }}
        >
          <span className="vf-ico">
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="vf-txt">
            <b>{connect.join(', ')}</b>
            <small>{copy.connectHint}</small>
          </span>
          <span className="vf-btn">{copy.connect}</span>
        </button>
      )}
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
