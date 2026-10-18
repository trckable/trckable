// Live's last card: four quiet figures for the site's health, each opening its own part of Explore. A figure with
// nothing behind it says "Set up" to someone who can set it up, and a dash to someone who cannot.
import { fmtFixed, fmtInt } from '../../lib/format'
import { hasMentions } from '../../lib/me'
import { can } from '../../lib/permissions'
import { navigate } from '../../lib/url'
import type { Site } from '../../lib/api'
import { openExplore } from '../explore/open'
import { gradeOf } from '../explore/data/mapSections'
import type { DayState } from '../../features/incidents/model'
import { useHealth } from './useHealth'
import { copy } from './copy'

const h = copy.health

interface Props {
  site: Site
  /** The clock Live runs by (ms), for how long a site has been down. */
  now: number
  /** Unix seconds the site stopped answering, while it is down. */
  downSince?: number
}

interface SegProps {
  label: string
  tag?: string
  /** The figure; none draws the quiet empty state. */
  value?: string
  word?: string
  bad?: boolean
  bar?: DayState[]
  waiting: boolean
  open: () => void
}

/** What a figure with nothing behind it says: a blank while it is read, "Set up" for someone who can, a dash for the rest. */
function emptyWord(waiting: boolean): string {
  if (waiting) return '\u00a0'
  return can('site.settings') ? h.setUp : '—'
}

function Seg({ label, tag, value, word, bad, bar, waiting, open }: SegProps) {
  const empty = value === undefined
  const quiet = emptyWord(waiting)
  return (
    <button type="button" className={`lhseg${bad ? ' bad' : ''}`} onClick={open} aria-busy={waiting} data-seg={label}>
      <span className="lhl">
        {label}
        {tag && <span className="mk-tag new">{tag}</span>}
      </span>
      {empty ? (
        <span className="lhn quiet">{quiet}</span>
      ) : (
        <>
          <b className="lhn">{value}</b>
          {word && <span className="lhw">{word}</span>}
        </>
      )}
      {bar && (
        <svg className="lhbar" width="64" height="14" viewBox="0 0 64 14" role="img" aria-label={h.days16}>
          {bar.map((s, i) => (
            <rect key={i} className={`lhb ${s}`} x={i * 4} y="2" width="3" height="10" rx="1" />
          ))}
        </svg>
      )}
    </button>
  )
}

const uptimeValue = (down: boolean, pct?: string): string | undefined => (down ? (pct ?? '—') : pct)
const uptimeWord = (down: boolean, minutes: number, pct?: string): string | undefined => {
  if (down) return h.downNow(minutes)
  return pct ? h.up : undefined
}
const aiWord = (answers: number): string => (answers > 0 ? h.answers(fmtInt(answers)) : h.hits)

export function HealthStrip({ site, now, downSince }: Props) {
  const health = useHealth(site, true)
  const down = downSince !== undefined
  const minutes = down ? Math.max(0, Math.round((now - downSince * 1000) / 60_000)) : 0
  const speed = health.speed
  const up = health.uptime
  const upDays = up ? up.days.map((d, i) => (down && i === up.days.length - 1 ? ('down' as const) : d)) : undefined
  const pct = up?.pct != null ? h.pct(fmtFixed(up.pct, 1)) : undefined
  const ai = health.ai
  const showMentions = hasMentions()
  return (
    <section className="mk-card lhealth" aria-label={h.label} data-count={showMentions ? 4 : 3}>
      <Seg
        label={h.speed}
        waiting={speed === undefined}
        value={speed != null ? h.sec(fmtFixed(speed, 1)) : undefined}
        word={speed != null ? h.grades[gradeOf(0, speed)] : undefined}
        open={() => openExplore('speed')}
      />
      <Seg
        label={h.uptime}
        waiting={!down && up === undefined}
        value={uptimeValue(down, pct)}
        word={uptimeWord(down, minutes, pct)}
        bad={down}
        bar={down || pct ? upDays : undefined}
        open={() => navigate(`/${encodeURIComponent(site.domain)}/incidents`)}
      />
      <Seg
        label={h.ai}
        waiting={ai === undefined}
        value={ai ? fmtInt(ai.hits) : undefined}
        word={ai ? aiWord(ai.answers) : undefined}
        open={() => openExplore('ai')}
      />
      {showMentions && (
        <Seg
          label={h.mentions}
          tag={h.preview}
          waiting={health.mentions === undefined}
          value={health.mentions != null ? fmtInt(health.mentions) : undefined}
          word={health.mentions != null ? h.newWeek : undefined}
          open={() => openExplore('mentions')}
        />
      )}
    </section>
  )
}
