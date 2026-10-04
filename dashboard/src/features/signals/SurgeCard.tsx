// The card for a surge: the site is far busier than usual right now. It says
// how many are on and how many times the usual, who sent most of them, which
// page, and the jump, all counted. Calm: a small ghost, no confetti. It slides
// in over Live and Data alike, and "See it" opens today in Data, filtered to the
// source. The browser notice (only for someone who said yes, and only when the
// tab is out of sight) is told once for each surge.
import { Bell, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SideCard, useCardClose } from '../../components/SideCard/SideCard'
import { toast } from '../../components/Toast'
import { setView } from '../../lib/url'
import { useSeen, wasSeen, markSeen } from '../install/seen'
import { signals } from './copy'
import { askPermission, canNotify, tell } from './notify'
import { pref, setPref } from './prefs'
import { surgeFilter, surgeLines, surgeNotice, surgeNow, type Surge } from './surge'
import { SurgeShape, SurgeStory } from './SurgeStory'
import { useSurge } from './useSurge'
import './signals.css'

const t = signals.surge

export default function SurgeCard({ site }: { site: { id: string; domain: string; timezone: string } }) {
  const surge = useSurge(site.id)
  useNotice(surge, site.domain)
  if (!surge) return null
  return <Card key={surge.id} surge={surge} tz={site.timezone} />
}

/** Tells the browser once for each surge, when the tab is out of sight (in sight, the card is the notice). */
function useNotice(surge: Surge | null, domain: string) {
  const id = surge?.id
  useEffect(() => {
    if (!surge || !id || wasSeen('surge-told', id)) return
    markSeen('surge-told', id)
    if (document.visibilityState === 'visible' && document.hasFocus()) return
    const n = surgeNotice(surge, domain)
    tell(n.title, n.body, 'surge-' + id)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps -- once for each surge: its id says which
}

function Card({ surge, tz }: { surge: Surge; tz: string }) {
  const [gone, putAway] = useSeen('surge', surge.id)
  const [more, setMore] = useState(false)
  if (gone) return null
  const lines = surgeLines(surge)
  const story = !!surge.story
  return (
    <SideCard
      id="surge"
      asked // it will not keep: it comes up over a card that came up by itself
      ghost
      label={t.label}
      closeLabel={t.close}
      kind={{ icon: <Zap size={14} strokeWidth={2} />, label: t.label, tint: 'var(--accent)' }}
      title={t.title}
      onClose={putAway}
      chart={more && story ? <SurgeShape surge={surge} /> : undefined}
      actions={<Actions surge={surge} done={putAway} />}
    >
      <p className="sg-body sg-lead">{surgeNow(surge)}</p>
      {lines.slice(0, 2).map((l) => (
        <p key={l} className="muted sg-body">
          {l}
        </p>
      ))}
      {more && (
        <>
          {lines.slice(2).map((l) => (
            <p key={l} className="muted sg-body">
              {l}
            </p>
          ))}
          <SurgeStory surge={surge} tz={tz} />
        </>
      )}
      {(story || lines.length > 2) && (
        <button type="button" className="btn ghost sg-more" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? t.less : t.more}
        </button>
      )}
    </SideCard>
  )
}

function Actions({ surge, done }: { surge: Surge; done: () => void }) {
  const close = useCardClose()
  const filter = surgeFilter(surge)
  const ask = canNotify() && Notification.permission === 'default' && !pref('notify')
  const see = () => {
    setView({ live: false, period: 'today', from: undefined, to: undefined, filters: filter ? [filter] : [], day: undefined })
    done()
    close()
  }
  const notify = () => {
    void askPermission().then((p) => {
      setPref('notify', p === 'granted')
      if (p === 'denied') toast(signals.blocked, 'warning')
    })
  }
  return (
    <>
      {ask && (
        <button type="button" className="btn ghost" onClick={notify}>
          <Bell size={14} strokeWidth={2} aria-hidden="true" /> {t.notify}
        </button>
      )}
      <button type="button" className="btn primary" onClick={see}>
        {t.see}
      </button>
    </>
  )
}
