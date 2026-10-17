// The milestones window: the newest one as a hero, a ring for each next step,
// and every one reached, grouped by year, each with Replay and Share.
import { Flag, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type Milestone, type Milestones, type Site } from '../../lib/api'
import { Modal } from '../../kit/Modal'
import { copy } from './copy'
import { Hero } from './MilestoneHero'
import { DoneTile, NextTile } from './MilestoneTiles'
import { Moment } from './Moment'
import { byYear, nearest, newest } from './words'
import './Timeline.css'

export function Timeline({ site, revenue, onShare, onClose }: { site: Site; revenue: boolean; onShare: (m: Milestone) => void; onClose: () => void }) {
  const [data, setData] = useState<Milestones | null>(null)
  const [replay, setReplay] = useState<{ m: Milestone; n: number } | null>(null)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    api
      .milestones(site.id, true)
      .then(setData)
      .catch(() => setData({ enabled: true, milestones: [], moment: null }))
  }, [site.id])
  const list = data?.milestones ?? []
  const next = data?.next ?? []
  const play = (m: Milestone) => {
    setReplay({ m, n: (replay?.n ?? 0) + 1 })
    body.current?.scrollTo?.({ top: 0 })
  }
  let at = 0
  return (
    <Modal label={copy.title} className="ms-modal ms-window" onClose={onClose}>
      <div className="ms-head">
        <h2>
          <Flag size={18} strokeWidth={1.75} aria-hidden="true" />
          {copy.title} · {site.domain}
        </h2>
        <button type="button" className="btn icon ghost" aria-label={copy.close} onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div className="ms-body" ref={body}>
        {replay && <Moment key={replay.n} m={replay.m} onShare={() => onShare(replay.m)} />}
        {data && !data.enabled && <p className="faint">{copy.off}</p>}
        {data && data.enabled && (
          <>
            <Hero m={newest(list)} next={nearest(next)} revenue={revenue} onShare={onShare} onReplay={play} />
            {next.length > 0 && (
              <section className="ms-group">
                <h3>{copy.nextUp}</h3>
                <ul className="ms-tiles ms-nexts">
                  {next.map((n, i) => (
                    <NextTile key={n.kind} n={n} i={i} />
                  ))}
                </ul>
              </section>
            )}
            {byYear(list).map((y) => (
              <section className="ms-group" key={y.year}>
                <h3>{copy.reachedIn(y.year)}</h3>
                <ul className="ms-tiles ms-dones">
                  {y.items.map((m) => (
                    <DoneTile key={m.kind + m.step} m={m} i={at++} revenue={revenue} onReplay={() => play(m)} onShare={() => onShare(m)} />
                  ))}
                </ul>
              </section>
            ))}
            {list.length === 0 && next.length === 0 && <p className="faint">{copy.none}</p>}
          </>
        )}
      </div>
    </Modal>
  )
}
