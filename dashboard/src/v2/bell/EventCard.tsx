// What a notification opens: the concrete event behind it. The head says what happened, where and when, the body shows the
// evidence (the visit behind a goal, a signup or a sale; the outage; the post), and one quiet link leads on to the page the
// event lives on. A bottom sheet on a phone (the shared dialog). Its own chunk: only a tap on a row loads it.
import { ArrowRight, X } from 'lucide-react'
import { XIco } from '../ui/XIcons'
import { Modal } from '../../kit/Modal'
import type { Site } from '../../lib/api'
import { EventDown } from './EventDown'
import { EventMention } from './EventMention'
import { EventSale } from './EventSale'
import { EventVisit } from './EventVisit'
import { whenOf } from './days'
import { eventCopy as t } from './eventCopy'
import type { Notice } from './notices'
import '../../mock/theme.css'
import './event.css'

function Body({ n, site }: { n: Notice; site: Site }) {
  if (n.kind === 'sale') return <EventSale n={n} site={site} />
  if (n.kind === 'down' || n.kind === 'up') return <EventDown n={n} site={site} />
  if (n.kind === 'mention') return <EventMention n={n} />
  return <EventVisit n={n} site={site} />
}

function seeOf(n: Notice): string {
  if (n.kind === 'down' || n.kind === 'up') return t.seeIncidents
  if (n.kind === 'mention') return t.seeMentions
  if (n.goal) return n.kind === 'signup' ? t.seeSignups : t.seeGoal
  return t.seeExplore
}

/** `onSee` leads on to where the event lives (the row's own page); the card closes with it. */
export default function EventCard({ n, site, onSee, onClose }: { n: Notice; site: Site; onSee: () => void; onClose: () => void }) {
  return (
    <Modal label={t.label} onClose={onClose} className="ev-card" keepSize={false} focus="box">
      <button type="button" className="ev-x" aria-label={t.close} onClick={onClose}>
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <h2 className="ev-head">
        {(n.kind === 'signup' || n.kind === 'goal') && <XIco name="results" className="ev-tile" />}
        {[n.title, n.title.includes(n.site) ? '' : n.site, whenOf(n.exact ?? n.at, undefined, site.timezone)].filter(Boolean).join(' · ')}
      </h2>
      <div className="ev-body">
        <Body n={n} site={site} />
      </div>
      <div className="ev-foot">
        <button type="button" className="ev-see" onClick={onSee}>
          {seeOf(n)}
          <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </Modal>
  )
}
