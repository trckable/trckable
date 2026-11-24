// A day's goals as one card, one fixed size: the goals that stand out first, with why, then those that were as usual, and a tap on a
// goal tells it (each time it happened) beside the list, or in place of it on a phone. The list and the times scroll inside; the
// head and the two buttons stay put, so nothing moves when another goal is chosen. Its own chunk: only a tap on the row loads it.
import { useState } from 'react'
import { ChevronLeft, Target, X } from 'lucide-react'
import { Modal } from '../../kit/Modal'
import { fmtInt } from '../../lib/format'
import type { Site } from '../../lib/api'
import { GoalRead } from '../goals/GoalFacts'
import { GoalGlyph } from '../goals/goalMarks'
import { QuietButton } from '../goals/QuietButton'
import { stand } from '../goals/standCopy'
import { nameOf, reasonOf, split } from '../goals/standing'
import { timeOf, dayOf } from './days'
import type { FeedGoal } from './feed'
import { dayName, type Notice } from './notices'
import '../../mock/theme.css'
import './event.css'
import '../goals/standing.css'

function Pick({ g, on, zone, onPick }: { g: FeedGoal; on: boolean; zone?: string; onPick: () => void }) {
  const name = nameOf(g)
  return (
    <button type="button" className={`gs-pick${g.out ? ' out' : ''}`} aria-current={on} onClick={onPick}>
      <GoalGlyph g={g} />
      <span className="gs-pick-text">
        <span className="gs-pick-name" title={name}>{name}</span>
        {g.out && <span className="gs-pick-why">{reasonOf(g)}</span>}
      </span>
      {!g.out && g.last ? <span className="gs-pick-last">{stand.last(timeOf(g.last, zone))}</span> : null}
      <b className="gs-pick-n">{fmtInt(g.count)}</b>
    </button>
  )
}

/** `onOpen` leads on to Explore's Goals tab: on one goal's page, or (no goal) the list. */
export default function GoalsStory({ n, site, onOpen, onClose }: { n: Notice; site: Site; onOpen: (goal?: string) => void; onClose: () => void }) {
  const day = n.stand?.day ?? ''
  const goals = n.stand?.goals ?? []
  const { out, usual } = split(goals)
  const [pick, setPick] = useState<string>(goals[0]?.goal ?? '')
  const [view, setView] = useState<'list' | 'detail'>('list')
  const chosen = goals.find((g) => g.goal === pick)
  const [now] = useState(() => Date.now() / 1000)
  const today = dayOf(now, site.timezone) === day
  const when = dayName(day, now, site.timezone)
  const total = goals.reduce((sum, g) => sum + g.count, 0)
  const choose = (g: FeedGoal) => {
    setPick(g.goal)
    setView('detail')
  }
  const list = (title: string, items: FeedGoal[]) =>
    items.length > 0 && (
      <>
        <h3 className="gs-sec">{title}</h3>
        {items.map((g) => (
          <Pick key={g.goal} g={g} on={g.goal === pick} zone={site.timezone} onPick={() => choose(g)} />
        ))}
      </>
    )
  return (
    <Modal label={stand.label} onClose={onClose} className="gs-card mk-tokens" keepSize={false} focus="box">
      <header className="gs-bar">
        {view === 'detail' && (
          <button type="button" className="gs-back" aria-label={stand.back} onClick={() => setView('list')}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        )}
        <span className="gs-bar-ico" aria-hidden="true">
          <Target size={16} />
        </span>
        <h2 className="gs-bar-title" title={stand.head(total, fmtInt(total), when, n.site)}>
          {stand.head(total, fmtInt(total), when, n.site)}
        </h2>
        <span className="gs-bar-pill">{out.length === 0 ? stand.chipNormal : stand.chipOut(out.length)}</span>
        <button type="button" className="ev-x gs-x" aria-label={stand.close} onClick={onClose}>
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>
      <div className="gs-body" data-view={view}>
        <div className="gs-side">
          <div className="gs-scroll">
            {list(stand.standsOut, out)}
            {list(stand.asUsual, usual)}
          </div>
          <button type="button" className="gs-all" onClick={() => onOpen()}>
            {stand.openDay(when)} →
          </button>
        </div>
        {chosen && (
          <div className="gs-detail">
            <div className="gs-detail-bar">
              <GoalGlyph g={chosen} size={15} />
              <h3 className="gs-detail-head" title={nameOf(chosen)}>{nameOf(chosen)}</h3>
            </div>
            <GoalRead key={chosen.goal} site={site} goal={chosen.goal} from={day} to={day} label={today ? stand.tileToday : stand.tileReached} withDay={false}>
              {(p) => (
                <div className="gs-actions">
                  <button type="button" className="gs-open" onClick={() => onOpen(chosen.goal)}>
                    {stand.openGoals}
                  </button>
                  <QuietButton site={site.id} goal={chosen.goal} quiet={!!p.quiet} />
                </div>
              )}
            </GoalRead>
          </div>
        )}
      </div>
    </Modal>
  )
}
