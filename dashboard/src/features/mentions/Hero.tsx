import { copy } from './copy'
import { page } from './pageCopy'
import { stillComing, type Hero as HeroValue } from './pageModel'
import { SourceMark } from './SourceMark'
import { Spark } from './Spark'

/** The top of the page: who is talking about the site now, or a calm summary. */
export function Hero({ hero, curves, onOpen }: { hero: NonNullable<HeroValue>; curves: Record<string, number[]>; onOpen: (id: number) => void }) {
  if (hero.kind === 'calm') {
    const m = hero.best
    return (
      <section className="card mp-hero calm" aria-labelledby="mp-hero-h">
        <h2 id="mp-hero-h">{page.calm(hero.count, hero.visitors)}</h2>
        {m.visitors > 0 && (
          <p className="muted">
            {page.best}:{' '}
            <button type="button" className="mentions-link" onClick={() => onOpen(m.id)}>
              {m.title || copy.name[m.source]}
            </button>{' '}
            · {copy.brought(m.visitors)}
          </p>
        )}
      </section>
    )
  }
  const m = hero.m
  const curve = curves[m.id]
  return (
    <section className="card mp-hero now" aria-labelledby="mp-hero-h">
      <p className="mp-eyebrow" id="mp-hero-h">
        <span className="mp-pulse" aria-hidden="true" />
        {page.nowTitle}
      </p>
      <div className="mp-hero-main">
        <span className="mp-bigmark">
          <SourceMark source={m.source} />
        </span>
        <div>
          <p className="mp-hero-title">
            <button type="button" className="mp-plain" onClick={() => onOpen(m.id)}>
              {m.title || copy.name[m.source]}
            </button>
          </p>
          <p className="muted">
            {copy.name[m.source]}
            {m.author ? ` · ${copy.by(m.author)}` : ''}
          </p>
          <p className="mp-hero-line">
            <strong>{page.nowLine(m.visitors)}</strong>
            {stillComing(curve, m) && <span> · {page.stillComing}</span>}
          </p>
        </div>
        <div className="mp-hero-spark">
          <Spark values={curve ?? []} w={220} h={56} label={page.curveLabel} />
        </div>
      </div>
    </section>
  )
}
