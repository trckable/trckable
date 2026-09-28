// The timeline: every milestone of the site, newest first by year, each with
// Replay and Share, and a faint row for the next step of each family.
import { Banknote, Eye, Globe, Target, Trophy, Users, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Milestone, type MilestoneKind, type Milestones, type Site } from '../../lib/api'
import { fmtDay } from '../../lib/dates'
import { Modal } from '../../components/Modal'
import { copy } from './copy'
import { Moment } from './Moment'
import { byYear, nextLine, say } from './words'

const ICON: Record<MilestoneKind, LucideIcon> = { visitors: Users, pageviews: Eye, record_day: Trophy, countries: Globe, first_goal: Target, first_sale: Banknote, revenue: Banknote }

function Icon({ kind }: { kind: MilestoneKind }) {
  const I = ICON[kind]
  return (
    <span className="ms-ic" aria-hidden="true">
      <I size={15} strokeWidth={1.75} />
    </span>
  )
}

function Row({ m, onReplay, onShare }: { m: Milestone; onReplay: () => void; onShare: () => void }) {
  const w = say(m)
  return (
    <li className={w.money ? 'ms-row money' : 'ms-row'}>
      <Icon kind={m.kind} />
      <span className="ms-t">
        {w.big && <b>{w.big}</b>} {w.label}
      </span>
      <span className="ms-d">{fmtDay(m.day, { year: true })}</span>
      <span className="ms-acts">
        <button type="button" className="btn ghost" onClick={onReplay}>
          {copy.replay}
        </button>
        <button type="button" className="btn ghost" onClick={onShare}>
          {copy.share}
        </button>
      </span>
    </li>
  )
}

export function Timeline({ site, onShare, onClose }: { site: Site; onShare: (m: Milestone) => void; onClose: () => void }) {
  const [data, setData] = useState<Milestones | null>(null)
  const [replay, setReplay] = useState<{ m: Milestone; n: number } | null>(null)
  useEffect(() => {
    api
      .milestones(site.id, true)
      .then(setData)
      .catch(() => setData({ enabled: true, milestones: [], moment: null }))
  }, [site.id])
  const list = data?.milestones ?? []
  return (
    <Modal label={copy.title} className="ms-modal" onClose={onClose}>
      <div className="ms-head">
        <h2>{copy.title}</h2>
        <button type="button" className="btn icon ghost" aria-label={copy.close} onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {replay && <Moment key={replay.n} m={replay.m} onShare={() => onShare(replay.m)} />}
      {data && !data.enabled && <p className="faint">{copy.off}</p>}
      {data && list.length === 0 && <p className="faint">{copy.none}</p>}
      <ul className="ms-list">
        {(data?.next ?? []).map((n) => (
          <li key={'next-' + n.kind} className="ms-row next">
            <Icon kind={n.kind} />
            <span className="ms-t">{nextLine(n)}</span>
          </li>
        ))}
        {byYear(list).map((y) => (
          <li key={y.year} className="ms-year-group">
            <span className="ms-year">{y.year}</span>
            <ul>
              {y.items.map((m) => (
                <Row key={m.kind + m.step} m={m} onReplay={() => setReplay({ m, n: (replay?.n ?? 0) + 1 })} onShare={() => onShare(m)} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
