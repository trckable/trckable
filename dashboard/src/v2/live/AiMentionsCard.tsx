// Live's AI & mentions card: how many AI crawlers read the site and which assistants they came from, and how often the
// assistants name the site in an answer (where Answers is on).
import { answersCopy } from '../../features/answers/copy'
import type { Site } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { hasAnswers } from '../../lib/me'
import { openExplore } from '../explore/open'
import { copy } from './copy'
import { EmptyBlock } from './EmptyBlock'
import { CardSkeleton } from './CardSkeleton'
import { loading, type Health } from './useHealth'

const h = copy.health

function Ring({ seen, total }: { seen: number; total: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <button type="button" className="lhring" onClick={() => openExplore('answers')} title={answersCopy.seen(seen, total)} aria-label={answersCopy.seen(seen, total)}>
      <span className="lhrg">
        <svg viewBox="0 0 84 84" aria-hidden="true">
          <circle className="lhtrack" cx="42" cy="42" r={r} />
          <circle className="lhfill" cx="42" cy="42" r={r} strokeDasharray={`${c * (total > 0 ? Math.min(seen / total, 1) : 0)} ${c}`} transform="rotate(-90 42 42)" />
        </svg>
        <b>{`${seen}/${total}`}</b>
      </span>
      <span className="lhrl">{h.answersWord}</span>
    </button>
  )
}

function Crawlers({ ai, answers }: { ai: Health['ai']; answers: Health['answers'] }) {
  return (
    <div className="lhai">
      <button type="button" className="lhcount" onClick={() => openExplore(hasAnswers() ? 'answers' : 'ai')}>
        <b className="lhn">{ai ? fmtInt(ai.hits) : 0}</b>
        <span>{h.crawlerVisits}</span>
        <span className="lhmarks">
          {(ai?.engines ?? []).map((e) => (
            <i key={e.name} title={`${e.name} ${fmtInt(e.hits)}`}>
              {e.mark}
            </i>
          ))}
        </span>
      </button>
      {answers && <Ring seen={answers.seen} total={answers.total} />}
    </div>
  )
}

interface Props {
  site: Site
  health: Health
}

export function AiMentionsCard({ site, health }: Props) {
  const { ai, answers } = health
  const body = ai || answers ? <Crawlers ai={ai} answers={answers} /> : <EmptyBlock site={site} line={h.empty.ai} ghost={['rows']} action={{ label: h.connectCrawlers, setup: 'crawlers', ask: h.askAi }} />
  return (
    <section className="mk-card lcard lhc" aria-label={h.aiMentions}>
      <div className="ph">
        <span className="t">{h.aiMentions}</span>
      </div>
      <div className="pb lhbody">
        {loading(health) ? <CardSkeleton kind="ai" /> : body}
      </div>
    </section>
  )
}
