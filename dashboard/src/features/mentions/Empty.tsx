import { Radar } from 'lucide-react'
import { TipText } from '../../kit/Tooltip'
import type { Source, Words as WordsValue } from './api'
import { copy } from './copy'
import { page } from './pageCopy'
import { SourceMark } from './SourceMark'
import { Spark } from './Spark'
import { Words } from './Words'

const SAMPLE = [1, 2, 2, 4, 9, 18, 14, 9, 6, 5, 3, 3]

/** A mention as it will look: faded, tagged as a sample, never mistaken for a real one. */
function Sample() {
  return (
    <div className="card mp-card mp-sample" role="group" aria-label={page.sample}>
      <div className="mp-card-top">
        <SourceMark source="hn" />
        <span>{copy.name.hn}</span>
        <span className="mp-tag">{page.sampleTag}</span>
      </div>
      <p className="mp-title">{page.sampleTitle}</p>
      <div className="mp-impact">
        <Spark values={SAMPLE} w={96} h={28} />
        <p className="mp-num">
          <strong>{128}</strong>
          <span>{copy.visitorsLabel}</span>
        </p>
      </div>
    </div>
  )
}

/** Nothing found yet: a calm hero, the words and the places watched as small cards, and a faded sample. */
export function Empty({ site, words, sources, onWords }: { site: string; words: WordsValue; sources: Source[]; onWords: (w: WordsValue) => void }) {
  return (
    <section className="mp-empty" aria-labelledby="mp-empty-h">
      <div className="card mp-empty-hero">
        <span className="mp-empty-icon" aria-hidden="true">
          <Radar size={28} strokeWidth={1.75} />
        </span>
        <h2 id="mp-empty-h">{page.emptyTitle}</h2>
        <p className="mp-watching">
          <span className="mp-pulse" aria-hidden="true" />
          {page.watching}
        </p>
      </div>
      <div className="card mp-empty-words">
        <h3>
          <TipText text={page.words} tip={page.wordsTip} />
        </h3>
        <Words site={site} words={words} onWords={onWords} />
      </div>
      <div className="card mp-empty-sources">
        <h3>
          <TipText text={page.where} tip={page.every} />
        </h3>
        <ul className="mp-tiles">
          {sources.map((s) => (
            <li key={s} className="mp-tile" title={page.every}>
              <SourceMark source={s} />
              <span>{copy.name[s]}</span>
            </li>
          ))}
        </ul>
      </div>
      <Sample />
    </section>
  )
}
