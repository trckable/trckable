// Live's AI & mentions card: how many AI crawlers read the site and which assistants they came from, how often the
// assistants name the site in an answer (where Answers is on), and where people mentioned it (where Mentions is on).
import { answersCopy } from '../../features/answers/copy'
import type { Source } from '../../features/mentions/api'
import type { Site } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { hasAnswers, hasMentions } from '../../lib/me'
import { openExplore } from '../explore/open'
import { copy } from './copy'
import { EmptyBlock } from './EmptyBlock'
import type { Health } from './useHealth'

const h = copy.health
const MARK: Record<Source, string> = { hn: 'Y', ph: 'P', news: 'N', ref: 'R' }

function Ring({ seen, total }: { seen: number; total: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <button type="button" className="lhring" onClick={() => openExplore('answers')} title={answersCopy.seen(seen, total)} aria-label={answersCopy.seen(seen, total)}>
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle className="lhtrack" cx="42" cy="42" r={r} />
        <circle className="lhfill" cx="42" cy="42" r={r} strokeDasharray={`${c * (total > 0 ? Math.min(seen / total, 1) : 0)} ${c}`} transform="rotate(-90 42 42)" />
      </svg>
      <b>{`${seen}/${total}`}</b>
      <span>{h.answersWord}</span>
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

function Mentions({ m }: { m: NonNullable<Health['mentions']> }) {
  return (
    <button type="button" className="lhment" onClick={() => openExplore('mentions')}>
      <span className="lhl">
        <b>{m.n > 0 ? h.mentionsNew(m.n) : h.noMentions}</b>
        {m.n > 0 && <span>{h.thisWeek}</span>}
        <span className="mk-tag new">{h.preview}</span>
      </span>
      {m.sources.length > 0 && (
        <span className="lhchips">
          {m.sources.map((s) => (
            <span key={s} className="lhchip">
              <i>{MARK[s]}</i>
              {h.sources[s]}
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

interface Props {
  site: Site
  health: Health
}

export function AiMentionsCard({ site, health }: Props) {
  const { ai, answers, mentions } = health
  const waiting = ai === undefined && answers === undefined
  return (
    <section className="mk-card lcard lhc" aria-label={h.aiMentions}>
      <div className="ph">
        <span className="t">{h.aiMentions}</span>
      </div>
      <div className="pb lhbody">
        {ai || answers ? <Crawlers ai={ai} answers={answers} /> : <EmptyBlock site={site} line={h.empty.ai} ghost={['rows']} action={{ label: h.connectCrawlers, setup: 'crawlers' }} waiting={waiting} reserve={96} />}
        {hasMentions() && site.mentions && mentions && <Mentions m={mentions} />}
      </div>
    </section>
  )
}
